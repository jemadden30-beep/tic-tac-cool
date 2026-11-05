"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { AnimationEvent } from "@/lib/types";
import { POWER_DEFS } from "@/lib/powers";

export function PowerFX({
  animation,
  onDone,
}: {
  animation: AnimationEvent | null;
  onDone: () => void;
}) {
  if (!animation) return null;
  const def = POWER_DEFS[animation.power];

  return (
    <AnimatePresence>
      <motion.div
        key={animation.id}
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onAnimationComplete={() => {
          setTimeout(onDone, 900);
        }}
      >
        <motion.div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <motion.div
          className="relative flex flex-col items-center gap-2"
          initial={{ scale: 0.4, rotate: -20, y: 40 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <motion.span
            className="text-7xl drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]"
            animate={
              animation.power === "tornado"
                ? { rotate: 360 }
                : animation.power === "lightning"
                  ? { scale: [1, 1.4, 1], y: [0, -20, 0] }
                  : animation.power === "boot"
                    ? { x: [-30, 30, 0], rotate: [-20, 20, 0] }
                    : { scale: [1, 1.2, 1] }
            }
            transition={{ duration: 0.8 }}
          >
            {def.emoji}
          </motion.span>
          <motion.p
            className="rounded-full bg-fuchsia-600/90 px-4 py-1 text-sm font-bold uppercase tracking-widest text-white shadow-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {def.name}!
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function CellFX({
  animation,
  index,
}: {
  animation: AnimationEvent | null;
  index: number;
}) {
  if (!animation) return null;
  const meta = animation.meta || {};
  const hit =
    meta.index === index ||
    (Array.isArray(meta.cleared) && (meta.cleared as number[]).includes(index)) ||
    meta.a === index ||
    meta.b === index;

  if (!hit && animation.power !== "tornado" && animation.power !== "expansion") return null;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 rounded-xl"
      initial={{ opacity: 0.9, scale: 0.8 }}
      animate={{ opacity: 0, scale: 1.4 }}
      transition={{ duration: 0.7 }}
      style={{
        background:
          animation.power === "lightning"
            ? "radial-gradient(circle, #fde047, transparent)"
            : animation.power === "boot"
              ? "radial-gradient(circle, #fb923c, transparent)"
              : animation.power === "broom"
                ? "radial-gradient(circle, #86efac, transparent)"
                : "radial-gradient(circle, #c084fc, transparent)",
      }}
    />
  );
}
