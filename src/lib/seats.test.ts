import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttc-seats-"));
process.env.DATA_DIR = dir;
// Pre-seed stale connected:true rooms as if saved before a deploy.
fs.writeFileSync(
  path.join(dir, "dots-rooms.json"),
  JSON.stringify({
    STALE: {
      code: "STALE", mode: "online", hostId: "h", phase: "playing",
      players: [
        { id: "h", name: "Host", mark: "X", connected: true },
        { id: "ghost", name: "Cool Cat", mark: "O", connected: true },
      ],
    },
  })
);
fs.writeFileSync(
  path.join(dir, "rooms.json"),
  JSON.stringify({
    TSTALE: {
      code: "TSTALE", mode: "online", hostId: "h", phase: "playing",
      players: [
        { id: "h", name: "Host", mark: "X", connected: true },
        { id: "ghost", name: "Cool Cat", mark: "O", connected: true },
      ],
    },
  })
);

test("boot resets connected:false so stale P2 can be reclaimed (dots + ttt)", async () => {
  const d = await import("./dots/store");
  const t = await import("./store");
  assert.ok(d.getDotsRoom("STALE")!.players.every((p) => !p.connected));
  assert.ok(t.getRoom("TSTALE")!.players.every((p) => !p.connected));
  const r = d.joinDotsRoom("STALE", "real", "Friend");
  assert.equal(r.ok, true);
  const r2 = t.joinRoom("TSTALE", "real", "Friend");
  assert.equal(r2.ok, true);
});

test("dots: join claims P2, connected P2 blocks, host kickO works mid-game", async () => {
  const d = await import("./dots/store");
  const room = d.createDotsRoom({ hostId: "host", hostName: "H", mode: "online", firstTo: 3 });
  assert.equal(d.joinDotsRoom(room.code, "g1", "G1").ok, true);
  const full = d.joinDotsRoom(room.code, "g2", "G2");
  assert.equal(full.ok, false);
  room.phase = "playing";
  assert.equal(d.kickDotsOSeat(room.code, "g1").ok, false); // non-host
  const k = d.kickDotsOSeat(room.code, "host");
  assert.equal(k.ok, true);
  assert.equal(k.ok && k.kickedId, "g1");
  assert.equal(d.joinDotsRoom(room.code, "g2", "G2").ok, true);
  assert.equal(d.deleteDotsRoom(room.code, "stranger").ok, false);
  assert.equal(d.deleteDotsRoom(room.code, "g2").ok, true);
  assert.equal(d.getDotsRoom(room.code), undefined);
});

test("ttt: host kickO mid-game even when P2 connected, then delete", async () => {
  const t = await import("./store");
  const room = t.createRoom({ hostId: "host", hostName: "H", mode: "online", firstTo: 3 });
  assert.equal(t.joinRoom(room.code, "g1", "G1").ok, true);
  room.phase = "playing";
  assert.equal(t.kickOSeat(room.code, "host").ok, true);
  assert.equal(t.deleteRoom(room.code, "host").ok, true);
});
