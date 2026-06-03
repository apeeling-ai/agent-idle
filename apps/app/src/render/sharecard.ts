/**
 * Share card — STUB. The screenshot-ready flex card (creature + armor + rank) renders
 * through the SAME compositor as the live pet and leaderboard avatars (never fork the
 * layer stack). Real implementation: render a Scene to an offscreen target and export
 * a PNG/Blob.
 *
 * Lives behind the renderer seam: no Tauri APIs here.
 */

import { buildScene, type CreatureView, type Scene } from "./compositor";

export interface ShareCardInput {
  creature: CreatureView;
  score: number;
  rank?: number;
}

export interface ShareCardResult {
  scene: Scene;
  caption: string;
  /** TODO: a real exported image (Blob/dataURL) rendered through the compositor. */
  image: null;
}

export function buildShareCard(input: ShareCardInput): ShareCardResult {
  // TODO: render `scene` offscreen via the renderer and export an image.
  return {
    scene: buildScene(input.creature),
    caption: `${input.creature.species} • score ${input.score}${input.rank ? ` • #${input.rank}` : ""}`,
    image: null,
  };
}
