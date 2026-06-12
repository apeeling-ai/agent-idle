import { formatDuration } from "./format";
import type { ActionMs } from "./types";

/** A horizontal stacked bar splitting time by category, tinted to match the diorama rooms.
 * Reads like the scene: shell→mine, edit→lumber, read & web → the pond (fishing) — plus
 * `thinking` (working with no tool) and `idle` (waiting / between turns). */
const SEGMENTS: { key: keyof ActionMs; label: string; color: string }[] = [
  { key: "shell", label: "shell", color: "var(--act-shell)" },
  { key: "edit", label: "edit", color: "var(--act-edit)" },
  { key: "read", label: "read", color: "var(--act-read)" },
  { key: "web", label: "web", color: "var(--act-web)" },
  { key: "thinking", label: "thinking", color: "var(--act-thinking)" },
  { key: "idle", label: "idle", color: "var(--act-idle)" },
];

export function EffortBar({ actionMs }: { actionMs: ActionMs }) {
  const total = SEGMENTS.reduce((s, seg) => s + actionMs[seg.key], 0);

  return (
    <div className="effort">
      <div className="effort__track">
        {total > 0 ? (
          SEGMENTS.map((seg) => {
            const v = actionMs[seg.key];
            if (v <= 0) return null;
            return (
              <div
                key={seg.key}
                className="effort__seg"
                style={{ width: `${(v / total) * 100}%`, background: seg.color }}
                title={`${seg.label}: ${formatDuration(v)}`}
              />
            );
          })
        ) : (
          <div className="effort__empty">no work logged yet</div>
        )}
      </div>
      <div className="effort__legend">
        {SEGMENTS.map((seg) => (
          <span key={seg.key} className="effort__item">
            <i className="effort__swatch" style={{ background: seg.color }} />
            {seg.label}
            <b>{formatDuration(actionMs[seg.key])}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
