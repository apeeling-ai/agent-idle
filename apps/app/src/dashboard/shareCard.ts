/**
 * The "flex card" — an epic, screenshot-ready PNG of the player's progress, drawn on a 2D
 * canvas (no Pixi, no extra deps) so it works identically in the browser and the Tauri webview.
 *
 * This is the STATS brag card (rank, streak, tokens, trophies) shared from the Friends tab.
 * It is deliberately separate from render/sharecard.ts, which is the (still-stubbed) creature
 * sprite export that must go through the Pixi compositor — different concern, different seam.
 */

import { buildScene, LAYER_ORDER, type CreatureView, type Layer } from "../render/compositor";
import { CHARACTER_SHEETS, LPC_SHEETS, resolveAnimation, sheetUrl, type SpriteSheetSet } from "../render/sprites";
import { formatTokens } from "./format";

/** Everything the card + caption need. Built by the shell (App.tsx) from the live queries. */
export interface ShareStats {
  handle: string;
  level: number;
  seasonRank: { rank: number; total: number } | null;
  dailyRank: { rank: number; total: number } | null;
  /** Human-facing "Season N" (engine.seasonNumber), not the raw epoch index. */
  seasonNumber: number;
  lifetimeTokens: number;
  streak: number;
  longestStreak: number;
  daysActive: number;
  /** Trophy glyphs from past top-3 season finishes (best-first). */
  trophies: string[];
  /** The player's live avatar (LPC paper-doll + worn gear) — composited into the crest. */
  avatar?: CreatureView;
}

const C = {
  ink: "#141a12",
  ink2: "#1f2a18",
  panel: "#11160f",
  moss: "#8bd450",
  mossDim: "#6fae42",
  parch: "#cdd6c2",
  parchDim: "rgba(205, 214, 194, 0.62)",
  gold: "#ffd166",
  goldDeep: "#f2b705",
  edge: "#2c3a24",
} as const;

const MONO = '"SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace';

/** A punchy headline keyed off the player's season standing. */
function headline(s: ShareStats): string {
  const r = s.seasonRank?.rank;
  if (r === 1) return "👑 REIGNING CHAMPION";
  if (r && r <= 3) return "🥇 SEASON PODIUM";
  if (r && r <= 10) return "🔥 TOP TEN & CLIMBING";
  if (r) return "⚔️ ON THE LEADERBOARD";
  return "⚔️ AN EMPIRE IN THE MAKING";
}

/** The shareable hype caption (clipboard / Web Share text). Epic, braggy, a little cheeky. */
export function buildShareCaption(s: ShareStats): string {
  const lines: string[] = [];
  lines.push(`${headline(s)} — @${s.handle}'s Agent Idle run`);
  const bits: string[] = [`🪙 ${formatTokens(s.lifetimeTokens)} tokens fed`];
  if (s.seasonRank) {
    bits.push(`🏅 #${s.seasonRank.rank}${s.seasonRank.total ? `/${s.seasonRank.total}` : ""} Season ${s.seasonNumber}`);
  }
  if (s.streak > 0) bits.push(`🔥 ${s.streak}-day streak`);
  if (s.level > 0) bits.push(`✨ Lv ${s.level}`);
  lines.push(bits.join("  ·  "));
  if (s.trophies.length) {
    lines.push(`${s.trophies.join(" ")}  ${s.trophies.length} season ${s.trophies.length === 1 ? "trophy" : "trophies"}`);
  }
  lines.push("My AI familiars grind tokens while I sleep. Think you can out-grind me? #AgentIdle");
  return lines.join("\n");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { size: number; color: string; weight?: string; align?: CanvasTextAlign; glow?: string; family?: string },
) {
  ctx.font = `${opts.weight ?? "400"} ${opts.size}px ${opts.family ?? MONO}`;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "alphabetic";
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 18;
  }
  ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
}

/** One labelled stat box (e.g. SEASON / #4). */
function tile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: string,
) {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.edge;
  ctx.stroke();
  const cx = x + w / 2;
  text(ctx, label, cx, y + 24, { size: 12, color: C.parchDim, weight: "700" });
  text(ctx, value, cx, y + h - 20, { size: 30, color: valueColor, weight: "700" });
}

/** The character layers (no diorama floor / status bubble) that make up a standing avatar,
 * bottom → top. The aura halo sits behind the body; the weapon on top. */
const AVATAR_LAYERS: Layer[] = LAYER_ORDER.filter((l) => l !== "ground" && l !== "scene" && l !== "status") as Layer[];

interface AvatarLayer {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function sheetSetFor(spriteKey: string): SpriteSheetSet | null {
  return LPC_SHEETS[spriteKey] ?? CHARACTER_SHEETS[spriteKey] ?? null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // same-origin /sprites — keeps the canvas exportable
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite load failed: ${url}`));
    img.src = url;
  });
}

/** Load each equipped layer's idle frame so the avatar can be composited onto the card. Returns
 * null if anything is missing (the crest then falls back to a glyph). */
async function loadAvatar(view: CreatureView): Promise<AvatarLayer[] | null> {
  try {
    const scene = buildScene(view);
    const specs = AVATAR_LAYERS.flatMap((layer) => {
      const key = scene[layer].sprite;
      if (!key) return [];
      const set = sheetSetFor(key);
      if (!set) return [];
      const spec = resolveAnimation(set, "idle");
      return [{ url: sheetUrl(spec.sheet), spec }];
    });
    const layers = await Promise.all(
      specs.map(async ({ url, spec }) => ({
        img: await loadImage(url),
        sx: spec.x ?? 0,
        sy: spec.y ?? 0,
        sw: spec.frameWidth,
        sh: spec.frameHeight,
      })),
    );
    return layers.length ? layers : null;
  } catch {
    return null;
  }
}

/** Draw the card and hand back a PNG blob + a data URL for an inline <img> preview. */
export async function renderShareCard(s: ShareStats): Promise<{ blob: Blob; dataUrl: string }> {
  const W = 540;
  const H = 700;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.scale(scale, scale);

  // Composite the player's real avatar (LPC body + worn gear) for the crest; fall back to a glyph.
  const avatar = s.avatar ? await loadAvatar(s.avatar) : null;

  // Backdrop: ink gradient + a moss glow up top.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.ink2);
  bg.addColorStop(1, C.ink);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 80, 20, W / 2, 80, 320);
  glow.addColorStop(0, "rgba(139, 212, 80, 0.18)");
  glow.addColorStop(1, "rgba(139, 212, 80, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Framed border.
  roundRect(ctx, 12, 12, W - 24, H - 24, 20);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.goldDeep;
  ctx.shadowColor = "rgba(242, 183, 5, 0.45)";
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Wordmark.
  text(ctx, "⚔  AGENT IDLE  ⚔", W / 2, 62, { size: 17, color: C.moss, weight: "700" });
  text(ctx, headline(s), W / 2, 92, { size: 13, color: C.parchDim, weight: "700" });

  // Crest.
  const crestY = 178;
  ctx.beginPath();
  ctx.arc(W / 2, crestY, 56, 0, Math.PI * 2);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.gold;
  ctx.shadowColor = "rgba(242, 183, 5, 0.5)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (avatar) {
    // Pixel-art: nearest-neighbour, clipped to the crest so the figure sits in the medallion.
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, crestY, 54, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    const D = 116; // on-card avatar cell size (the 64² frame scaled up)
    const ax = W / 2 - D / 2;
    const ay = crestY - D / 2 - 4; // nudge up: the figure sits in the lower part of its cell
    for (const l of avatar) ctx.drawImage(l.img, l.sx, l.sy, l.sw, l.sh, ax, ay, D, D);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  } else {
    ctx.font = `50px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.seasonRank?.rank === 1 ? "👑" : "🛡️", W / 2, crestY + 2);
    ctx.textBaseline = "alphabetic";
  }

  // Level pill.
  if (s.level > 0) {
    const pill = `LV ${s.level}`;
    ctx.font = `700 12px ${MONO}`;
    const pw = ctx.measureText(pill).width + 22;
    roundRect(ctx, W / 2 - pw / 2, crestY + 46, pw, 22, 11);
    ctx.fillStyle = C.gold;
    ctx.fill();
    text(ctx, pill, W / 2, crestY + 62, { size: 12, color: C.ink, weight: "700" });
  }

  // Handle.
  let handle = `@${s.handle}`;
  if (handle.length > 18) handle = `${handle.slice(0, 17)}…`;
  text(ctx, handle, W / 2, 312, { size: 30, color: C.parch, weight: "700" });

  // Hero stat: lifetime tokens fed.
  text(ctx, "TOKENS FED ALL-TIME", W / 2, 358, { size: 13, color: C.parchDim, weight: "700" });
  text(ctx, `🪙 ${formatTokens(s.lifetimeTokens)}`, W / 2, 412, { size: 52, color: C.gold, weight: "700", glow: "rgba(242,183,5,0.45)" });

  // Stat tiles.
  const pad = 34;
  const gap = 12;
  const tw = (W - pad * 2 - gap * 2) / 3;
  const ty = 452;
  const th = 96;
  tile(ctx, pad, ty, tw, th, "SEASON", s.seasonRank ? `#${s.seasonRank.rank}` : "—", C.moss);
  tile(ctx, pad + tw + gap, ty, tw, th, "🔥 STREAK", `${s.streak}`, C.gold);
  tile(ctx, pad + (tw + gap) * 2, ty, tw, th, "DAYS", `${s.daysActive}`, C.parch);

  // Trophy shelf.
  text(ctx, "SEASON TROPHIES", W / 2, 594, { size: 12, color: C.parchDim, weight: "700" });
  if (s.trophies.length) {
    const glyphs = s.trophies.slice(0, 8).join("  ");
    text(ctx, glyphs, W / 2, 632, { size: 30, color: C.parch });
  } else {
    text(ctx, "none yet — go win one", W / 2, 628, { size: 15, color: C.parchDim });
  }

  // Divider + footer call-to-action.
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 658);
  ctx.lineTo(W - pad, 658);
  ctx.stroke();
  text(ctx, "grow your own idle empire · #AgentIdle", W / 2, 682, { size: 13, color: C.mossDim, weight: "700" });

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  return { blob, dataUrl };
}
