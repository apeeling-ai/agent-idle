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

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlock: (() => void) | null = null;
  /** The "Work, work." clip decoded into the unlocked AudioContext. A bare <audio>.play() from
   * a data update can stay blocked on WebView2 even after a gesture, so we prefer the
   * (gesture-unlocked) context and keep <audio> only as a fallback. */
  private workBuffer: AudioBuffer | null = null;
  private workBufferLoading = false;

  constructor() {
    // Autoplay policy (Chromium/WebView2 especially) keeps an AudioContext SUSPENDED and
    // blocks <audio>.play() until the page has a user gesture — and crucially, resume() only
    // takes effect when the context is touched during/after a real gesture. Our cues fire from
    // data updates (tokens landing, a session finishing), never from a click, so without this
    // every cue is silent on WebView2. Resume the context on the first interaction anywhere in
    // the window (which also grants the page the "sticky activation" that lets <audio> play),
    // then detach.
    if (typeof window !== "undefined") {
      this.unlock = () => {
        const ctx = this.ensureContext(); // create + resume inside the gesture
        if (ctx) void this.loadWorkBuffer(ctx); // decode the clip so it plays via the unlocked ctx
        this.detachUnlock();
      };
      for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this.unlock, { passive: true });
    }
  }

  private detachUnlock(): void {
    if (this.unlock && typeof window !== "undefined") {
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this.unlock);
    }
    this.unlock = null;
  }

  /** Create the context if needed and resume it if suspended. Ignores the mute flag so the
   * first-gesture unlock can prime it even while muted (it's silent until a cue plays). */
  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** The context for actually playing a cue — null when muted or Web Audio is unavailable. */
  private context(): AudioContext | null {
    if (this.muted) return null;
    return this.ensureContext();
  }

  play(cue: SoundCue): void {
    if (this.muted) return;
    const ctx = this.context();
    if (cue === "workDone") {
      // Prefer the gesture-unlocked AudioContext (reliable on WebView2); fall back to <audio>.
      if (ctx && this.workBuffer) this.playBuffer(ctx, this.workBuffer, 0.9);
      else {
        if (ctx) void this.loadWorkBuffer(ctx); // prime for next time
        this.clip(WORK_WORK_URL);
      }
      return;
    }
    if (!ctx) return;
    if (cue === "coin") this.cashing(ctx);
  }

  /** Fetch + decode the "Work, work." wav into an AudioBuffer once, for playback via the
   * unlocked context. Best-effort: on any failure workBuffer stays null and play() uses <audio>. */
  private async loadWorkBuffer(ctx: AudioContext): Promise<void> {
    if (this.workBuffer || this.workBufferLoading) return;
    this.workBufferLoading = true;
    try {
      const res = await fetch(WORK_WORK_URL);
      this.workBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      /* leave null — play() falls back to <audio> */
    } finally {
      this.workBufferLoading = false;
    }
  }

  /** Play a decoded buffer through the context. */
  private playBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
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
    this.detachUnlock();
    void this.ctx?.close();
    this.ctx = null;
  }
}
