/**
 * Tiny hand-rolled sparkline (no chart library — KISS for ≤6 points). Draws a
 * normalized polyline in a fixed viewBox; scales responsively via width=100%.
 */
export function Sparkline({
  values,
  className,
  height = 36,
  width = 96,
}: {
  values: number[];
  className?: string;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3;
  const usableH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / span) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label="Xu hướng giá trị ròng"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={rising ? "var(--color-positive)" : "var(--color-negative)"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
