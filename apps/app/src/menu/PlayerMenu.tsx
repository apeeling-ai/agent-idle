/**
 * The player menu — opened by clicking the cabin (the player's home) in the diorama. The
 * player's CHARACTER sheet: a big composited avatar of the worn loadout, the unbounded prestige
 * level, and the four gear slots (armor / weapon / helm / aura). Each slot shows what's EQUIPPED;
 * clicking it opens a GRID of every tier — unlocked ones you can equip, locked ones showing what
 * you still need to reach them — so the whole progression is visible at a glance.
 *
 * Pure props-driven, like the Dashboard — App.tsx owns the data (engine.playerProgress /
 * playerGallery) and the persisted loadout + equip mutation, so this tree stays portable.
 */

import { useState } from "react";
import type { Loadout, PlayerProgress, SlotGallery } from "@agent-idle/engine";
import { formatTokens } from "../dashboard/format";
import "./menu.css";

/** Presentation metadata per gear slot — icon + human label. */
const SLOT_META: Record<string, { icon: string; label: string }> = {
  armor: { icon: "🛡️", label: "Armor" },
  weapon: { icon: "⚔️", label: "Weapon" },
  helm: { icon: "⛑️", label: "Helm" },
  aura: { icon: "✨", label: "Aura" },
};

/** Idle-game display NAME per rung (the engine emits the bare key; the menu shows the
 * polished tier name). Keyed by slot → rung. */
const RUNG_NAMES: Record<string, Record<string, string>> = {
  armor: { cloth: "Cloth", leather: "Leather", chain: "Chainmail", plate: "Plate", legion: "Legion" },
  helm: { nasal: "Iron Cap", norman: "Norman", barbuta: "Barbute", greathelm: "Greathelm", legion: "Centurion" },
  weapon: { bronze: "Bronze", iron: "Iron", steel: "Steel", mithril: "Mithril", prismatic: "Prismatic" },
  aura: { spark: "Spark", flame: "Flame", radiant: "Radiant" },
};

function rungLabel(slotName: string, rung: string): string {
  return RUNG_NAMES[slotName]?.[rung] ?? rung.charAt(0).toUpperCase() + rung.slice(1);
}

/** The LPC body the gear pieces stack onto (served via the /sprites symlink). */
const BODY_URL = "/sprites/lpc/body/idle.png";

/** Layer order for the composited preview (bottom → top), mirroring the in-world compositor. */
const RENDER_ORDER = ["armor", "helm", "weapon", "aura"] as const;

/** Resolve a slot+rung to its LPC piece PNG (mirrors render/sprites.ts LPC_SHEETS). Armor/helm/
 * weapon each have distinct per-rung art; aura has no art yet (→ null). */
function pieceUrl(slotName: string, rung: string): string | null {
  if (slotName === "armor") return `/sprites/lpc/armor/${rung}.png`;
  if (slotName === "helm") return `/sprites/lpc/helm/${rung}.png`;
  if (slotName === "weapon") return `/sprites/lpc/weapon/${rung}.png`;
  return null; // aura (no art yet)
}

/** The worn rung per slot, parsed from the resolved cosmetic ids ("armor.plate" → "plate"). */
function wornRungs(equipped: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of equipped) {
    const dot = id.indexOf(".");
    if (dot > 0) out[id.slice(0, dot)] = id.slice(dot + 1);
  }
  return out;
}

/**
 * The layered piece URLs for the hero wearing the current loadout, optionally with ONE slot
 * swapped to a preview rung. Used for both the big avatar and each tier cell ("you, in this").
 */
function heroLayers(worn: Record<string, string>, swapSlot?: string, swapRung?: string): string[] {
  const urls = [BODY_URL];
  for (const slot of RENDER_ORDER) {
    const rung = slot === swapSlot ? swapRung : worn[slot];
    const url = rung ? pieceUrl(slot, rung) : null;
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * A pixel-art thumbnail of the LPC hero with layers stacked, cropped to the south-facing idle
 * frame (the same frame the in-world renderer shows). `urls` draw bottom→top. `scale` × the 64².
 */
function GearSprite({ urls, scale = 1.5 }: { urls: string[]; scale?: number }) {
  const cell = 64 * scale;
  return (
    <div className="gear-sprite" style={{ width: cell, height: cell }}>
      {urls.map((u, i) => (
        <span
          key={i}
          style={{
            backgroundImage: `url(${u})`,
            backgroundSize: `${128 * scale}px ${256 * scale}px`, // full sheet, scaled
            backgroundPosition: `0px ${-128 * scale}px`, // south row (y=128), frame 0
          }}
        />
      ))}
    </div>
  );
}

/** A collapsible slot: the equipped tier as a header, expanding to the full tier grid. */
function GearSlot({
  gallery,
  worn,
  hasOverride,
  open,
  onToggle,
  onEquip,
}: {
  gallery: SlotGallery;
  worn: Record<string, string>;
  hasOverride: boolean;
  open: boolean;
  onToggle: () => void;
  onEquip: (slot: string, rung: string | null) => void;
}) {
  const meta = SLOT_META[gallery.slot] ?? { icon: "•", label: gallery.slot };
  const wornRung = worn[gallery.slot]; // the rung actually worn right now (override or auto)
  const unlockedCount = gallery.rungs.filter((r) => r.unlocked).length;
  const total = gallery.rungs.length;

  return (
    <div className={`slot ${open ? "slot--open" : ""} ${gallery.unlocked ? "" : "slot--locked"}`}>
      {/* Header: the equipped PIECE (item only — not the whole model) + tier; toggles the grid. */}
      <button type="button" className="slot__head" onClick={onToggle}>
        <span className="slot__thumb">
          {wornRung && pieceUrl(gallery.slot, wornRung) ? (
            <GearSprite urls={[pieceUrl(gallery.slot, wornRung)!]} scale={0.7} />
          ) : (
            <span className="slot__thumb-icon">{meta.icon}</span>
          )}
        </span>
        <span className="slot__id">
          <span className="slot__label">
            {meta.icon} {meta.label}
          </span>
          <span className="slot__worn">
            {gallery.unlocked && wornRung ? (
              <>
                <span className="slot__tier">T{gallery.currentRung + 1}</span>
                {rungLabel(gallery.slot, wornRung)}
                {gallery.cycle > 0 ? <span className="slot__prestige">★{gallery.cycle}</span> : null}
                {!hasOverride ? <span className="slot__auto">auto</span> : null}
              </>
            ) : (
              <span className="slot__lockedmsg">🔒 unlocks at {formatTokens(gallery.rungs[0]?.unlockAt ?? 0)}</span>
            )}
          </span>
        </span>
        <span className="slot__count">
          {unlockedCount}/{total}
        </span>
        <span className={`slot__chev ${open ? "slot__chev--open" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {/* The tier grid: every rung as a card, locked ones showing what's still needed. */}
      {open ? (
        <div className="tiers">
          {/* Auto — wear your highest tier automatically (clears the override). */}
          {gallery.unlocked ? (
            <button
              type="button"
              className={`tier tier--auto ${hasOverride ? "" : "tier--on"}`}
              onClick={() => onEquip(gallery.slot, null)}
              title="Auto — always wear your highest tier"
            >
              <span className="tier__auto-mark">A</span>
              <span className="tier__name">Auto</span>
            </button>
          ) : null}

          {gallery.rungs.map((r) => {
            const equipped = r.rungName === wornRung;
            const purl = pieceUrl(gallery.slot, r.rungName);
            return (
              <button
                key={r.rungName}
                type="button"
                className={`tier ${r.unlocked ? "" : "tier--locked"} ${equipped ? "tier--on" : ""}`}
                disabled={!r.unlocked}
                onClick={() => onEquip(gallery.slot, r.rungName)}
                title={r.unlocked ? `Equip ${rungLabel(gallery.slot, r.rungName)}` : `Unlocks at ${formatTokens(r.unlockAt)} tokens`}
              >
                <span className="tier__t">T{r.rung + 1}</span>
                {/* Just the ITEM (not the whole player model) — cleaner in a grid. */}
                {purl ? <GearSprite urls={[purl]} scale={0.85} /> : <span className="tier__noart">{meta.icon}</span>}
                <span className="tier__name">{rungLabel(gallery.slot, r.rungName)}</span>
                {r.unlocked ? (
                  equipped ? <span className="tier__badge tier__badge--on">Equipped</span> : <span className="tier__badge">Equip</span>
                ) : (
                  <span className="tier__badge tier__badge--locked">🔒 {formatTokens(r.unlockAt)}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PlayerMenu({
  name,
  tokens,
  progress,
  gallery,
  loadout,
  equipped,
  onEquip,
  onClose,
  onOpenStats,
}: {
  name: string;
  tokens: number;
  progress: PlayerProgress;
  /** Every slot's rung ladder + unlock flags (engine.playerGallery). */
  gallery: SlotGallery[];
  /** The persisted per-slot override (engine.Loadout) or null. */
  loadout: Loadout | null;
  /** The resolved cosmetic ids actually worn — drives the big preview + per-slot headers. */
  equipped: string[];
  /** Equip a rung (rung=null clears the override → auto-highest). */
  onEquip: (slot: string, rung: string | null) => void;
  onClose: () => void;
  onOpenStats: () => void;
}) {
  // Which slot's tier grid is expanded (accordion — one at a time). Default: weapon, so the
  // progression grid the player asked for is visible immediately.
  const [openSlot, setOpenSlot] = useState<string | null>("weapon");
  const levelPct = Math.round(progress.progress * 100);
  const worn = wornRungs(equipped);

  return (
    <div className="menu">
      <div className="menu__bg" aria-hidden />
      <header className="menu__top">
        <span className="menu__title">{name}</span>
        <button type="button" className="menu__close" onClick={onClose} title="Back to pets">
          ✕
        </button>
      </header>

      {/* Hero: the composited avatar (full worn loadout) + the unbounded prestige level. */}
      <section className="menu__hero">
        <div className="menu__avatar">
          <GearSprite urls={heroLayers(worn)} scale={2.2} />
          <span className="menu__avatar-level">Lv {progress.level}</span>
        </div>
        <div className="menu__hero-right">
          <div className="menu__tokens">🪙 {formatTokens(tokens)} fed</div>
          <div className="menu__bar menu__bar--level">
            <div className="menu__fill" style={{ width: `${levelPct}%` }} />
          </div>
          <div className="menu__next">{100 - levelPct}% to Level {progress.level + 1}</div>
        </div>
      </section>

      {/* Gear — each slot shows what's equipped; click to reveal its full tier grid. */}
      <section className="menu__gear">
        <h3 className="menu__h">
          Gear <span className="menu__h-hint">click a slot to change tier</span>
        </h3>
        {gallery.map((g) => (
          <GearSlot
            key={g.slot}
            gallery={g}
            worn={worn}
            hasOverride={loadout?.[g.slot] != null}
            open={openSlot === g.slot}
            onToggle={() => setOpenSlot((cur) => (cur === g.slot ? null : g.slot))}
            onEquip={onEquip}
          />
        ))}
      </section>

      <footer className="menu__foot">
        <button type="button" className="menu__stats-btn" onClick={onOpenStats}>
          View full stats →
        </button>
      </footer>
    </div>
  );
}
