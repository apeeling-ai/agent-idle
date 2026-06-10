/**
 * The daily "close your ring" meter — styled like the pet energy bar: a moss arc on a
 * recessed track with a gold leading-edge glow. `fraction` is 0..1 (clamped).
 */
export function Ring({
  fraction,
  size = 132,
  stroke = 12,
  center,
  caption,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  /** Big text in the middle (e.g. "1h 20m"). */
  center: string;
  /** Small text under it (e.g. "of 2h goal"). */
  caption?: string;
}) {
  const f = Math.max(0, Math.min(1, fraction));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const closed = f >= 1;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg className="ring__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--edge)"
          strokeWidth={stroke}
        />
        <circle
          className="ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={closed ? "var(--gold)" : "var(--moss)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - f)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__label">
        <span className="ring__value">{center}</span>
        {caption ? <span className="ring__caption">{closed ? "✓ goal met" : caption}</span> : null}
      </div>
    </div>
  );
}
