/**
 * The audio counterpart to the renderer seam. A tiny Web Audio cue player that
 * SYNTHESIZES short cues (no asset files) so the render/ folder stays self-contained and
 * extractable. Browser-only — like renderer-pixi.ts it touches a platform API, and like it
 * this module is NEVER imported by the pure compositor or the engine.
 *
 * Today it plays one cue: `workDone`, fired by the host when a pet finishes a session.
 */

/** Named cues the host can request. Extend as more moments get audio. */
export type SoundCue = "workDone";

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
    const ctx = this.context();
    if (!ctx) return;
    if (cue === "workDone") this.chime(ctx);
  }

  /** A bright two-note rise (A5 → C#6): "session complete". */
  private chime(ctx: AudioContext): void {
    const start = ctx.currentTime;
    for (const { freq, at } of [
      { freq: 880, at: 0 },
      { freq: 1108.73, at: 0.09 },
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = start + at;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
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
