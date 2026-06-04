import { Text } from "@shopify/polaris";

interface ScoreGaugeProps {
  score: number | null | undefined;
  status: "success" | "warning" | "critical";
  size?: number;
}

const STATUS_COLORS = {
  success: "#00a47c",
  warning: "#f2a600",
  critical: "#d72c0d",
};

const STATUS_LABELS = {
  success: "Good",
  warning: "Needs Improvement",
  critical: "Poor",
};

export function ScoreGauge({ score, status, size = 140 }: ScoreGaugeProps) {
  const displayScore = score ?? 0;
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  // SVG donut arc calculation
  const radius = 50;
  const cx = 60;
  const cy = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  // Arc spans 270° (from 135° to 405°) — a 3/4 circle gauge
  const arcLength = (circumference * 3) / 4;
  const filled = (displayScore / 100) * arcLength;
  const dashOffset = arcLength - filled;

  // Rotate so arc starts bottom-left
  const rotation = 135;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          style={{ transform: "rotate(0deg)", overflow: "visible" }}
        >
          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#e4e5e7"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation}, ${cx}, ${cy})`}
            style={{ transition: "all 0.6s ease" }}
          />
          {/* Score arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation}, ${cx}, ${cy})`}
            style={{ transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          />
          {/* Center score text */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="26"
            fontWeight="700"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          >
            {score == null ? "—" : Math.round(displayScore)}
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fill="#6d7175"
            fontSize="9"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          >
            / 100
          </text>
        </svg>
      </div>
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: "12px",
          background: color + "20",
          color,
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}
