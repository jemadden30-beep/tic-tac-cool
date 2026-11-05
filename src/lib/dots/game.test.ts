import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allEdgeIds,
  applyDotsPower,
  boxCoords,
  boxEdges,
  boxIndex,
  claimEdge,
  createDotsRoomState,
  hEdge,
  parseEdge,
  startDotsRound,
  vEdge,
} from "./game";
import { DOTS_POWER_DEFS, DOTS_POWER_ORDER } from "./powers";
import { BOXES, DOTS, type DotsPowerId, type DotsPowerTarget } from "./types";

function newRoom() {
  const room = createDotsRoomState({ code: "TEST", hostId: "host", hostName: "P1", mode: "hotseat", firstTo: 3 });
  startDotsRound(room);
  room.players[0].energy = 99;
  return room;
}

function fullBoard() {
  const room = newRoom();
  allEdgeIds().forEach((edge, i) => { room.edges[edge] = i % 2 ? "O" : "X"; });
  room.boxOwner = room.boxOwner.map((_, i) => i % 2 ? "O" : "X");
  for (const player of room.players) player.boxes = room.boxOwner.filter((owner) => owner === player.mark).length;
  room.lastClaim = { mark: "X", edge: hEdge(0, 0), boxesGained: [] };
  return room;
}

const newPowers: DotsPowerId[] = ["bomb", "row_clear", "col_clear", "cross_clear"];

function targetFor(power: DotsPowerId, index = 0): DotsPowerTarget {
  if (power === "bomb") return { kind: "box", index };
  if (power === "row_clear") return { kind: "row", index };
  if (power === "col_clear") return { kind: "col", index };
  return { kind: "dot", r: Math.floor(index / DOTS), c: index % DOTS };
}

for (const power of newPowers) {
  test(`${power} erases exactly its edges and reopens/recounts all affected boxes at every board position`, () => {
    const positions = power === "bomb" ? BOXES * BOXES : power === "cross_clear" ? DOTS * DOTS : BOXES;
    for (let index = 0; index < positions; index++) {
      const room = fullBoard();
      const before = structuredClone(room);
      const target = targetFor(power, index);
      const expected = allEdgeIds().filter((edge) => {
        const { axis, r, c } = parseEdge(edge)!;
        if (power === "bomb") {
          const { br, bc } = boxCoords(index);
          return boxEdges(br, bc).includes(edge);
        }
        if (power === "row_clear") return axis === "h" ? r === index || r === index + 1 : r === index;
        if (power === "col_clear") return axis === "v" ? c === index || c === index + 1 : c === index;
        return axis === "h" ? r === Math.floor(index / DOTS) : c === index % DOTS;
      });
      assert.equal(expected.length, power === "bomb" ? 4 : power === "cross_clear" ? 18 : 28);
      assert.deepEqual(applyDotsPower(room, "host", power, target), { ok: true });
      for (const edge of allEdgeIds()) assert.equal(room.edges[edge], expected.includes(edge) ? undefined : before.edges[edge]);
      for (let bi = 0; bi < BOXES * BOXES; bi++) {
        const { br, bc } = boxCoords(bi);
        const reopened = boxEdges(br, bc).some((edge) => expected.includes(edge));
        assert.equal(room.boxOwner[bi], reopened ? null : before.boxOwner[bi]);
      }
      for (const player of room.players) assert.equal(player.boxes, room.boxOwner.filter((owner) => owner === player.mark).length);
      assert.equal(room.players[0].energy, 99 - DOTS_POWER_DEFS[power].cost);
      assert.deepEqual(room.players[0].usedPowers, [power]);
      assert.equal(room.powerUsedThisTurn, true);
      assert.equal(room.turn, before.turn);
      assert.equal(room.phase, "playing");
      assert.deepEqual(room.lastClaim, expected.includes(hEdge(0, 0)) ? null : before.lastClaim);
      assert.equal(room.lastAnimation?.power, power);
      assert.deepEqual(room.lastAnimation?.meta?.target, target);
    }
  });

  test(`${power} refuses an empty target without spending energy or consuming the power`, () => {
    const room = newRoom();
    // A claimed edge outside the target must not make an empty target valid.
    room.edges[vEdge(8, 9)] = "O";
    const before = structuredClone(room);
    const result = applyDotsPower(room, "host", power, targetFor(power));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /no claimed edges/);
    assert.deepEqual(room, before);
  });

  test(`${power} can erase just one claimed edge, then the player can still claim normally`, () => {
    const room = newRoom();
    room.edges[hEdge(0, 0)] = "O";
    room.lastClaim = { mark: "O", edge: hEdge(0, 0), boxesGained: [] };
    assert.deepEqual(applyDotsPower(room, "host", power, targetFor(power)), { ok: true });
    assert.equal(room.edges[hEdge(0, 0)], undefined);
    assert.equal(room.lastClaim, null);
    assert.deepEqual(claimEdge(room, "host", hEdge(0, 0)), { ok: true });
    assert.equal(room.edges[hEdge(0, 0)], "X");
    assert.equal(room.turn, "O");
  });

  test(`${power} rejects invalid or wrong-kind targets without mutation`, () => {
    const invalid: unknown[] = [{ kind: "none" }, { kind: "edge", edge: hEdge(0, 0) }, null, undefined, {}];
    if (power === "cross_clear") {
      invalid.push({ kind: "box", index: 0 });
      for (const bad of [-1, DOTS, 0.5, NaN, Infinity, "0", undefined]) {
        invalid.push({ kind: "dot", r: bad, c: 0 }, { kind: "dot", r: 0, c: bad });
      }
    } else {
      const kind = power === "bomb" ? "box" : power === "row_clear" ? "row" : "col";
      for (const index of [-1, power === "bomb" ? BOXES * BOXES : BOXES, 0.5, NaN, Infinity, "0", undefined]) invalid.push({ kind, index });
      invalid.push({ kind: "dot", r: 0, c: 0 });
    }
    for (const target of invalid) {
      const room = fullBoard();
      const before = structuredClone(room);
      assert.equal(applyDotsPower(room, "host", power, target as DotsPowerTarget).ok, false);
      assert.deepEqual(room, before);
    }
  });

  test(`${power} obeys energy, silence, turn, phase, once-per-turn and once-per-round rules`, () => {
    for (const constraint of ["energy", "silence", "turn", "phase", "turn-used", "round-used"] as const) {
      const room = fullBoard();
      if (constraint === "energy") room.players[0].energy = DOTS_POWER_DEFS[power].cost - 1;
      if (constraint === "silence") room.players[0].silenced = true;
      if (constraint === "turn") { room.mode = "online"; room.turn = "O"; }
      if (constraint === "phase") room.phase = "round_over";
      if (constraint === "turn-used") room.powerUsedThisTurn = true;
      if (constraint === "round-used") room.players[0].usedPowers.push(power);
      const before = structuredClone(room);
      assert.equal(applyDotsPower(room, "host", power, targetFor(power)).ok, false, constraint);
      assert.deepEqual(room, before);
    }
    const room = fullBoard();
    room.players[0].energy = DOTS_POWER_DEFS[power].cost;
    assert.equal(applyDotsPower(room, "host", power, targetFor(power)).ok, true);
    assert.equal(room.players[0].energy, 0);
  });
}

test("bomb reopens adjacent boxes across all four shared borders but leaves distant boxes", () => {
  const room = fullBoard();
  assert.equal(applyDotsPower(room, "host", "bomb", { kind: "box", index: boxIndex(4, 4) }).ok, true);
  const reopened = room.boxOwner.flatMap((owner, i) => owner === null ? [i] : []);
  assert.deepEqual(reopened, [boxIndex(3, 4), boxIndex(4, 3), boxIndex(4, 4), boxIndex(4, 5), boxIndex(5, 4)]);
});

test("cross clear wipes the entire board row and column, not just the edges next to the selected dot", () => {
  const room = fullBoard();
  assert.equal(applyDotsPower(room, "host", "cross_clear", { kind: "dot", r: 4, c: 5 }).ok, true);
  for (const edge of [hEdge(4, 0), hEdge(4, 8), vEdge(0, 5), vEdge(8, 5)]) assert.equal(room.edges[edge], undefined);
  for (const edge of [hEdge(3, 5), hEdge(5, 5), vEdge(4, 4), vEdge(4, 6)]) assert.ok(room.edges[edge]);
});

test("snip still reopens and recounts boxes through shared erase helper", () => {
  const room = fullBoard();
  assert.equal(applyDotsPower(room, "host", "snip", { kind: "edge", edge: hEdge(0, 0) }).ok, true);
  assert.equal(room.boxOwner[0], null);
  assert.equal(room.players[0].boxes, 40);
  assert.equal(room.lastClaim, null);
});

test("all four new powers appear together immediately before Rewind with correct costs and targets", () => {
  const rewind = DOTS_POWER_ORDER.indexOf("rewind");
  assert.deepEqual(DOTS_POWER_ORDER.slice(rewind - 4, rewind), newPowers);
  assert.deepEqual(newPowers.map((id) => [DOTS_POWER_DEFS[id].cost, DOTS_POWER_DEFS[id].needsTarget]), [[35, "box"], [40, "row"], [40, "col"], [50, "dot"]]);
});
