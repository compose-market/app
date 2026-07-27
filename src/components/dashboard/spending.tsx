import { useId, useMemo } from "react";
import type { ChartMetric, TimelineBucket } from "@/lib/analytics";

export function SpendingChart({
  timeline,
  metrics,
  selectedMetric,
  onMetricChange,
  focused = false,
  dataBlock,
  onClick,
}: {
  timeline: TimelineBucket[];
  metrics: ChartMetric[];
  selectedMetric: string;
  onMetricChange: (metric: string) => void;
  focused?: boolean;
  dataBlock?: string;
  onClick?: () => void;
}) {
  const gradientId = useId().replace(/:/gu, "");
  const metric = metrics.find((candidate) => candidate.id === selectedMetric) ?? metrics[0];
  const data = useMemo(() => {
    if (!metric || timeline.length === 0) return null;
    const values = timeline.map((bucket) => metric.value(bucket.totals));
    const max = Math.max(...values, 0);
    const width = 100;
    const height = 100;
    const points = timeline.map((bucket, index) => ({
      x: timeline.length === 1 ? 50 : index * width / (timeline.length - 1),
      y: max === 0 ? 95 : height - values[index] / max * 85 - 5,
      bucket,
      value: values[index],
    }));
    const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
    return {
      points,
      linePath,
      areaPath: `${linePath} L ${points.at(-1)?.x ?? 50} ${height} L ${points[0]?.x ?? 50} ${height} Z`,
      total: values.reduce((sum, value) => sum + value, 0),
    };
  }, [metric, timeline]);

  return (
    <div className="cm-block" data-block={dataBlock} data-focused={focused} onClick={onClick}>
      <div className="cm-block__header">
        <select
          className="cm-chart-select"
          value={metric?.id}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onMetricChange(event.target.value)}
          aria-label="Chart metric"
        >
          {metrics.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
        {data && metric && <span className="cm-block__badge">{metric.format(data.total)}</span>}
      </div>
      {data && metric ? (
        <>
          <svg className="cm-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${metric.label} over time`}>
            <defs>
              <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path d={data.areaPath} fill={`url(#${gradientId}-fill)`} />
            <path d={data.linePath} fill="none" stroke={`url(#${gradientId}-stroke)`} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            {data.points.map((point) => (
              <circle key={point.bucket.timestamp} cx={point.x} cy={point.y} r="0.8" fill="hsl(var(--primary))">
                <title>{`${new Date(point.bucket.timestamp).toLocaleString()} · ${metric.format(point.value)}`}</title>
              </circle>
            ))}
          </svg>
          {focused && <div className="cm-chart-axis"><span>{new Date(timeline[0].timestamp).toLocaleDateString()}</span><span>{new Date(timeline.at(-1)!.endTimestamp).toLocaleDateString()}</span></div>}
        </>
      ) : <div className="cm-block__empty">No telemetry for this range</div>}
    </div>
  );
}
