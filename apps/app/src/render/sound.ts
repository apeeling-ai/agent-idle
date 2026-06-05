/**
 * The audio counterpart to the renderer seam. A tiny Web Audio cue player that
 * SYNTHESIZES short cues (no asset files) so the render/ folder stays self-contained and
 * extractable. Browser-only — like renderer-pixi.ts it touches a platform API, and like it
 * this module is NEVER imported by the pure compositor or the engine.
 *
 * Cues:
 *  - `workDone` — a pet finished a session: the peon "Work, work." voice clip.
 *  - `coin`     — tokens flew to the player: a bright cash-register "cha-ching".
 *
 * The "Work, work." line is a real audio clip served from /sounds; the cha-ching is
 * synthesized with oscillators.
 */

/** The peon "Work, work." clip (Vite serves apps/app/public at the web root). */
const WORK_WORK_URL = "/sounds/work-work.wav";

/** Named cues the host can request. Extend as more moments get audio. */
export type SoundCue = "workDone" | "coin";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private muted = false;

  /** Lazily create/resume the context. Autoplay policies require a prior user gesture; by
   * the time a pet finishes working the user has signed in and interacted, so resume() is
   * enough. Returns null when muted or Web Audio is unavailable. */
  private context(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(cue: SoundCue): void {
    if (this.muted) return;
    if (cue === "workDone") {
      this.clip(WORK_WORK_URL); // a real audio file — no AudioContext needed
      return;
    }
    const ctx = this.context();
    if (!ctx) return;
    if (cue === "coin") this.cashing(ctx);
  }

  /** Play a short audio file (e.g. the peon "Work, work." line). */
  private clip(src: string, volume = 0.9): void {
    if (typeof Audio === "undefined") return;
    const a = new Audio(src);
    a.volume = volume;
    void a.play().catch(() => {}); // autoplay can reject before any gesture — ignore
  }

  /** A bright two-note "cha-ching" (E6 → A6) for tokens landing on the player. */
  private cashing(ctx: AudioContext): void {
    const start = ctx.currentTime;
    for (const { freq, at } of [
      { freq: 1318.51, at: 0 },
      { freq: 1760, at: 0.08 },
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle"; // register-like brightness
      osc.frequency.value = freq;
      const t0 = start + at;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.16, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  destroy(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
