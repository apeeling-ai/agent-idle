/**
 * The player menu — the cabin's CHARACTER SHEET + gear FORGE, as a two-screen flow so it never
 * overflows a small overlay:
 *   1. ROSTER  — the hero on a pedestal, the shared coin wallet + level, and a compact one-line
 *      list of every gear slot (worn piece, rarity, next cost / MAX). Tap a slot →
 *   2. FORGE   — that one slot in focus: a big piece preview, the "forge the next tier" action
 *      (buy + save-up bar, or a MAXED banner at Ancient), and the wardrobe of owned ranks.
 *
 * Coins are minted by lifetime tokens and SPENT to climb each slot's finite Maple ladder, which
 * caps at the "Ancient" rarity. Pure props-driven — App.tsx owns the data (engine.playerShop /
 * resolveEquipped) and the buy/equip mutations, so this tree stays portable across both shells.
 */

import { useState } from "react";
import type { PlayerShop, SlotShop, TierInfo } from "@agent-idle/engine";
import { formatTokens } from "../dashboard/format";
import { ASSET_VERSION } from "../render/sprites";
import "./menu.css";

/** Cache-bust suffix so the menu fetches freshly-baked art (shared with the renderer). */
const V = `?v=${ASSET_VERSION}`;

/** Presentation metadata per gear slot — icon + human label. Order here = the roster order. */
const SLOT_META: Record<string, { icon: string; label: string }> = {
  armor: { icon: "🛡️", label: "Armor" },
  legs: { icon: "👖", label: "Legs" },
  weapon: { icon: "⚔️", label: "Weapon" },
  helm: { icon: "⛑️", label: "Helm" },
  aura: { icon: "✨", label: "Aura" },
};

/** Idle-game display NAME per rung (the engine emits the bare art key; the menu shows the
 * polished tier name). Keyed by slot → rung. */
const RUNG_NAMES: Record<string, Record<string, string>> = {
  armor: { cloth: "Cloth", leather: "Leather", chain: "Chainmail", plate: "Plate", legion: "Legion" },
  legs: { cloth: "Trousers", hose: "Hose", studded: "Studded", greaves: "Greaves", legion: "Legion" },
  helm: { nasal: "Iron Cap", norman: "Norman", barbuta: "Barbute", greathelm: "Greathelm", legion: "Centurion" },
  weapon: { bronze: "Bronze", iron: "Iron", steel: "Steel", mithril: "Mithril", prismatic: "Prismatic" },
  aura: { spark: "Spark", flame: "Flame", radiant: "Radiant" },
};

const RANK_NAMES = ["Rare", "Epic", "Unique", "Legendary", "Mythic"] as const;

/** Rank chip name from the art-ramp rung index (Rare → Mythic). The slot's FINAL rung caps the
 * climb at "Ancient" (the engine flags it `isAncient`) — it never cycles back to Rare. */
function rankName(rung: number, isAncient = false): string {
  if (isAncient) return "Ancient";
  return RANK_NAMES[rung] ?? `Rank ${rung + 1}`;
}

/** The rarity-chip CSS class for a tier — a distinct regal treatment at the Ancient cap. */
function rankClass(rung: number, isAncient = false): string {
  return `rank ${isAncient ? "rank--ancient" : `rank--${Math.max(0, rung)}`}`;
}

function rungLabel(slotName: string, rung: string): string {
  return RUNG_NAMES[slotName]?.[rung] ?? rung.charAt(0).toUpperCase() + rung.slice(1);
}

/** T(n)→T1 sub-tier pips for the current rung. */
function Subtiers({ current, max }: { current: number; max: number }) {
  return (
    <span className="subtiers" aria-label={`tier ${current} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={max - i >= current ? "subtiers__tier subtiers__tier--on" : "subtiers__tier"}>
          T{max - i}
        </span>
      ))}
    </span>
  );
}

/** The LPC body the gear pieces stack onto (served via the /sprites symlink). */
const BODY_URL = `/sprites/lpc/body/idle.png${V}`;

/** Worn layers drawn OVER the body (bottom → top): legs under torso armor, then helm + weapon.
 * The aura draws BEHIND the body (see heroLayers), mirroring the compositor's LAYER_ORDER. */
const RENDER_ORDER = ["legs", "armor", "helm", "weapon"] as const;

/** Resolve a slot+rung to its LPC piece PNG (mirrors render/sprites.ts LPC_SHEETS). */
function pieceUrl(slotName: string, rung: string): string | null {
  if (slotName === "armor") return `/sprites/lpc/armor/${rung}.png${V}`;
  if (slotName === "legs") return `/sprites/lpc/legs/${rung}.png${V}`;
  if (slotName === "helm") return `/sprites/lpc/helm/${rung}.png${V}`;
  if (slotName === "weapon") return `/sprites/lpc/weapon/${rung}.png${V}`;
  if (slotName === "aura") return `/sprites/lpc/aura/${rung}.png${V}`;
  return null;
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

/** The layered piece URLs for the hero wearing the current loadout (aura halo behind). */
function heroLayers(worn: Record<string, string>): string[] {
  const urls: string[] = [];
  const auraUrl = worn["aura"] ? pieceUrl("aura", worn["aura"]) : null;
  if (auraUrl) urls.push(auraUrl);
  urls.push(BODY_URL);
  for (const slot of RENDER_ORDER) {
    const url = worn[slot] ? pieceUrl(slot, worn[slot]!) : null;
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * A pixel-art thumbnail of stacked LPC layer crops, cropped to the south-facing idle frame (the
 * frame the in-world renderer shows). `urls` draw bottom→top. `scale` × the 64².
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
            backgroundSize: `${128 * scale}px ${256 * scale}px`,
            backgroundPosition: `0px ${-128 * scale}px`,
          }}
        />
      ))}
    </div>
  );
}

/** The piece thumbnail for one (slot, rung), or the slot icon when there's no art/rung. */
function PieceThumb({ slot, rung, scale }: { slot: string; rung: string | null; scale: number }) {
  const url = rung ? pieceUrl(slot, rung) : null;
  if (!url) return <span className="slot__thumb-icon">{SLOT_META[slot]?.icon ?? "•"}</span>;
  return <GearSprite urls={[url]} scale={scale} />;
}

/** The worn piece's info for a slot: the live top tier when worn-at-top (carries the T-pips),
 * else the completed lower rank chosen as an override. Null when the slot owns nothing. */
function wornInfoFor(slot: SlotShop): TierInfo | null {
  if (slot.top && slot.wornRank === slot.top.rank) return slot.top;
  return slot.ranks.find((r) => r.rank === slot.wornRank)?.info ?? slot.top;
}

/* ------------------------------------------------------------------------------------------- */
/* Screen 1 — the ROSTER list                                                                  */
/* ------------------------------------------------------------------------------------------- */

function RosterRow({ slot, onOpen }: { slot: SlotShop; onOpen: () => void }) {
  const meta = SLOT_META[slot.slot] ?? { icon: "•", label: slot.slot };
  const info = wornInfoFor(slot);
  return (
    <button type="button" className={`row ${slot.unlocked ? "" : "row--empty"}`} onClick={onOpen}>
      <span className="row__thumb">
        <PieceThumb slot={slot.slot} rung={info?.rungName ?? null} scale={0.62} />
      </span>
      <span className="row__id">
        <span className="row__top">
          <span className="row__slot">
            {meta.icon} {meta.label}
          </span>
          {slot.unlocked && info ? (
            <span className={rankClass(info.rung, info.isAncient)}>{rankName(info.rung, info.isAncient)}</span>
          ) : null}
        </span>
        <span className="row__sub">
          {slot.unlocked && info ? rungLabel(slot.slot, info.rungName) : "Empty — nothing forged yet"}
        </span>
      </span>
      <span className="row__action">
        {slot.maxed ? (
          <span className="row__max">MAX</span>
        ) : slot.next ? (
          <span className={`row__cost ${slot.next.affordable ? "row__cost--ready" : ""}`}>🪙 {formatTokens(slot.next.cost)}</span>
        ) : null}
        <span className="row__chev" aria-hidden>
          ▸
        </span>
      </span>
    </button>
  );
}

function Roster({
  name,
  tokens,
  shop,
  balance,
  worn,
  onOpenSlot,
  onClose,
  onOpenStats,
}: {
  name: string;
  tokens: number;
  shop: PlayerShop;
  balance: number;
  worn: Record<string, string>;
  onOpenSlot: (slot: string) => void;
  onClose: () => void;
  onOpenStats: () => void;
}) {
  const levelPct = Math.round(shop.level.progress * 100);
  return (
    <>
      <header className="menu__top">
        <span className="menu__title">{name}</span>
        <button type="button" className="menu__close" onClick={onClose} title="Back to pets">
          ✕
        </button>
      </header>

      <section className="menu__hero">
        <div className="menu__avatar">
          <GearSprite urls={heroLayers(worn)} scale={2.1} />
          <span className="menu__avatar-level">Lv {shop.level.level}</span>
        </div>
        <div className="menu__hero-right">
          <div className="menu__wallet" title="Coins to spend (minted by lifetime tokens)">
            <span className="menu__wallet-coin">🪙</span>
            <span className="menu__wallet-bal">{formatTokens(balance)}</span>
            <span className="menu__wallet-unit">coins</span>
          </div>
          <div className="menu__tokens">
            {formatTokens(tokens)} fed · {formatTokens(shop.wallet.spent)} spent
          </div>
          <div className="menu__bar menu__bar--level">
            <div className="menu__fill" style={{ width: `${levelPct}%` }} />
          </div>
          <div className="menu__next">{100 - levelPct}% to Level {shop.level.level + 1}</div>
        </div>
      </section>

      <section className="menu__gear">
        <h3 className="menu__h">
          Gear <span className="menu__h-hint">tap a slot to forge & equip</span>
        </h3>
        <div className="roster">
          {shop.slots.map((s) => (
            <RosterRow key={s.slot} slot={s} onOpen={() => onOpenSlot(s.slot)} />
          ))}
        </div>
      </section>

      <footer className="menu__foot">
        <button type="button" className="menu__stats-btn" onClick={onOpenStats}>
          View full stats →
        </button>
      </footer>
    </>
  );
}

/* ------------------------------------------------------------------------------------------- */
/* Screen 2 — the FORGE detail for one slot                                                    */
/* ------------------------------------------------------------------------------------------- */

function Forge({
  slot,
  balance,
  onBack,
  onBuy,
  onEquip,
}: {
  slot: SlotShop;
  balance: number;
  onBack: () => void;
  onBuy: (slot: string, expectedNext: number) => void;
  onEquip: (slot: string, rank: number | null) => void;
}) {
  const meta = SLOT_META[slot.slot] ?? { icon: "•", label: slot.slot };
  const info = wornInfoFor(slot);
  const atTop = !!slot.top && slot.wornRank === slot.top.rank;
  const next = slot.next;
  const buyPct = next ? Math.min(100, Math.round((balance / next.cost) * 100)) : 100;

  return (
    <>
      <header className="menu__top">
        <button type="button" className="forge__back" onClick={onBack} title="Back to gear">
          ‹ {meta.icon} {meta.label}
        </button>
        <span className="forge__wallet">🪙 {formatTokens(balance)}</span>
      </header>

      {/* The worn (or top) piece, in focus. */}
      <section className="forge__hero">
        <div className="forge__preview">
          {info ? <PieceThumb slot={slot.slot} rung={info.rungName} scale={1.8} /> : <span className="forge__noart">{meta.icon}</span>}
        </div>
        <div className="forge__meta">
          {info ? (
            <>
              <span className={rankClass(info.rung, info.isAncient)}>{rankName(info.rung, info.isAncient)}</span>
              <span className="forge__name">{rungLabel(slot.slot, info.rungName)}</span>
              {atTop ? <Subtiers current={slot.top!.subtier} max={slot.top!.maxSubtier} /> : null}
              {!slot.hasOverride ? <span className="slot__auto">auto-equipped</span> : <span className="slot__auto">equipped</span>}
            </>
          ) : (
            <span className="forge__name">Nothing forged yet</span>
          )}
        </div>
      </section>

      {/* Forge the next tier — or a maxed banner at Ancient. */}
      <section className="forge__buy">
        <h3 className="menu__h">Forge next</h3>
        {slot.maxed || !next ? (
          <div className="forge__maxed">
            <span className="forge__maxed-mark">✦</span>
            <span>
              <b>Ancient — fully forged.</b> This slot is maxed; there's nothing left to buy.
            </span>
          </div>
        ) : (
          <div className="buy">
            <span className="buy__thumb">
              <PieceThumb slot={slot.slot} rung={next.info.rungName} scale={0.7} />
            </span>
            <span className="buy__id">
              <span className="buy__title">
                <span className={rankClass(next.info.rung, next.info.isAncient)}>{rankName(next.info.rung, next.info.isAncient)}</span>
                {rungLabel(slot.slot, next.info.rungName)}
                {next.rankUp && slot.unlocked ? <span className="buy__tag">new rank</span> : null}
                {!next.rankUp ? <span className="buy__tag">T{next.info.subtier}</span> : null}
              </span>
              <span className="buy__bar">
                <span style={{ width: `${buyPct}%` }} className={next.affordable ? "buy__bar--ready" : ""} />
              </span>
              <span className="buy__hint">
                {next.affordable ? "Ready to forge" : `${formatTokens(next.shortfall)} more coins`}
              </span>
            </span>
            <button
              type="button"
              className={`buy__btn ${next.affordable ? "buy__btn--ready" : ""}`}
              disabled={!next.affordable}
              onClick={() => onBuy(slot.slot, slot.owned)}
              title={next.affordable ? `Forge for ${formatTokens(next.cost)} coins` : `Need ${formatTokens(next.shortfall)} more coins`}
            >
              <span className="buy__cost">🪙 {formatTokens(next.cost)}</span>
              <span className="buy__verb">{next.affordable ? "Forge" : "Locked"}</span>
            </button>
          </div>
        )}
      </section>

      {/* Wardrobe — re-equip any reached rank (or Auto → highest owned). */}
      {slot.unlocked ? (
        <section className="forge__wardrobe">
          <h3 className="menu__h">
            Wardrobe <span className="menu__h-hint">wear an owned rank</span>
          </h3>
          <div className="wear">
            <button
              type="button"
              className={`wear__cell wear__cell--auto ${!slot.hasOverride ? "wear__cell--on" : ""}`}
              onClick={() => onEquip(slot.slot, null)}
              title="Auto — always wear your highest tier"
            >
              <span className="wear__auto-mark">A</span>
              <span className="wear__name">Auto</span>
            </button>
            {slot.ranks
              .slice()
              .reverse()
              .map((r) => (
                <button
                  key={r.rank}
                  type="button"
                  className={`wear__cell ${r.worn && slot.hasOverride ? "wear__cell--on" : ""}`}
                  onClick={() => onEquip(slot.slot, r.rank)}
                  title={`Wear ${rungLabel(slot.slot, r.info.rungName)}`}
                >
                  <span className={`wear__rank ${rankClass(r.info.rung, r.info.isAncient)}`}>{rankName(r.info.rung, r.info.isAncient)}</span>
                  <PieceThumb slot={slot.slot} rung={r.info.rungName} scale={0.62} />
                  <span className="wear__name">{rungLabel(slot.slot, r.info.rungName)}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------- */

export function PlayerMenu({
  name,
  tokens,
  shop,
  equipped,
  onBuy,
  onEquip,
  onClose,
  onOpenStats,
}: {
  name: string;
  tokens: number;
  /** The whole shop view (wallet + level + per-slot state) from engine.playerShop. */
  shop: PlayerShop;
  /** The resolved cosmetic ids actually worn — drives the big avatar preview. */
  equipped: string[];
  /** Buy the next tier in a slot (expectedNext = the slot's current owned count). */
  onBuy: (slot: string, expectedNext: number) => void;
  /** Equip a reached rank (rank=null clears the override → auto-highest). */
  onEquip: (slot: string, rank: number | null) => void;
  onClose: () => void;
  onOpenStats: () => void;
}) {
  // null = the roster list; a slot name = that slot's forge detail screen.
  const [detailSlot, setDetailSlot] = useState<string | null>(null);
  const worn = wornRungs(equipped);
  // Never read below zero (e.g. owned tiers priced on an older, cheaper curve); buys stay gated by
  // the engine's exact balance.
  const balance = Math.max(0, shop.wallet.balance);
  const active = detailSlot ? shop.slots.find((s) => s.slot === detailSlot) : null;

  return (
    <div className="menu">
      {active ? (
        <Forge slot={active} balance={balance} onBack={() => setDetailSlot(null)} onBuy={onBuy} onEquip={onEquip} />
      ) : (
        <Roster
          name={name}
          tokens={tokens}
          shop={shop}
          balance={balance}
          worn={worn}
          onOpenSlot={setDetailSlot}
          onClose={onClose}
          onOpenStats={onOpenStats}
        />
      )}
    </div>
  );
}
