/**
 * The landing-page hero, alive. This is NOT a screenshot or a loop video — it's the real
 * compositor → Pixi → sound pipeline (the same one the app ships) driven by a few mock pets
 * that wander between rooms and earn coins on a timer. Headless: no Convex, no auth, no
 * session, just like the dev harness. If the renderer can't start it degrades to nothing
 * (the framing panel around it still reads), so the page never hard-fails on a GPU quirk.
 */

import { useEffect, useState } from "react";
import { PixiStage, type Creature } from "../PixiStage";
import { tintForSeed, type CreatureView, type AnimationName } from "../render/compositor";
import type { PetAction } from "@agent-idle/engine";

/** The mock menagerie: a player plus a handful of session pets, each with a name + a job that
 * sends it to a different room (shell→mine, edit→lumber, read & web → pond/fishing). */
const PETS: { key: string; name: string; action: PetAction }[] = [
  { key: "pet-refactor", name: "refactor-auth", action: "edit" },
  { key: "pet-tests", name: "fix-tests", action: "shell" },
  { key: "pet-docs", name: "read-docs", action: "read" },
  { key: "pet-scrape", name: "scrape-api", action: "web" },
];

/** Tick state: which pets are currently working, plus a per-pet coin counter we bump so the
 * PixiStage flies a coin to the player (its built-in token-increase animation). */
interface Tick {
  active: Set<string>;
  tokens: Record<string, number>;
}

const INITIAL: Tick = {
  active: new Set(["pet-refactor", "pet-tests"]),
  tokens: Object.fromEntries(PETS.map((p) => [p.key, 0])),
};

export function LiveDiorama({ muted = true }: { muted?: boolean }) {
  const [tick, setTick] = useState<Tick>(INITIAL);

  // Every couple of seconds: flip one pet's working state and pay every working pet a coin.
  // Math.random is fine here (app code, not the pure engine) — it only drives cosmetics.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => {
        const active = new Set(prev.active);
        const flip = PETS[Math.floor(Math.random() * PETS.length)].key;
        if (active.has(flip)) active.delete(flip);
        else active.add(flip);
        // Keep at least one pet busy so the scene never goes fully quiet.
        if (active.size === 0) active.add(PETS[0].key);
        const tokens = { ...prev.tokens };
        for (const key of active) tokens[key] = (tokens[key] ?? 0) + 1;
        return { active, tokens };
      });
    }, 2_200);
    return () => clearInterval(id);
  }, []);

  const playerView: CreatureView = {
    species: "knight",
    status: "lively",
    activity: "idle",
    alive: true,
    equipped: ["armor.plate", "helm.greathelm", "weapon.steel"],
    isPlayer: true,
  };

  const creatures: Creature[] = [
    { key: "player", view: playerView, name: "you", badge: "Lv 12", tokens: 0 },
    ...PETS.map((p): Creature => {
      const working = tick.active.has(p.key);
      const view: CreatureView = {
        species: "rogue",
        status: "lively",
        activity: working ? "active" : "idle",
        action: working ? p.action : undefined,
        alive: true,
        equipped: [],
        tint: tintForSeed(p.key),
        seed: p.key,
      };
      return { key: p.key, view, name: p.name, sub: working ? "working" : "idle", tokens: tick.tokens[p.key] };
    }),
  ];

  return (
    <div className="live-diorama">
      <PixiStage creatures={creatures} muted={muted} />
    </div>
  );
}

// (Kept around in case we want to label the demo actions; not currently shown.)
export const DEMO_ACTION_NAMES: Record<AnimationName, string> = {
  idle: "idle",
  spawn: "spawning",
  run: "run",
  walk: "walk",
  mine: "mining",
  hit: "hit",
  collect: "foraging",
  pierce: "pierce",
  slice: "chopping",
  fishing: "fishing",
  death: "down",
  revive: "reviving",
};
