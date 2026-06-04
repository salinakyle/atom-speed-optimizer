import { BlockStack, InlineStack, Text, Tooltip } from "@shopify/polaris";

interface MetricCardProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  status: "success" | "warning" | "critical";
  good: number;
  poor: number;
  tooltip: string;
  isDecimal?: boolean;
}

const STATUS_COLORS = {
  success: "#00a47c",
  warning: "#f2a600",
  critical: "#d72c0d",
};

const STATUS_BG = {
  success: "#f1faf8",
  warning: "#fff8ed",
  critical: "#fff4f4",
};

export function MetricCard({ label, value, unit, status, good, poor, tooltip, isDecimal }: MetricCardProps) {
  const color = STATUS_COLORS[status];
  const bg = STATUS_BG[status];

  const displayValue = value == null
    ? "—"
    : isDecimal
    ? (value as number).toFixed(3)
    : Math.round(value as number).toLocaleString();

  // Progress bar: 0% = at "good", 100% = at 2× poor
  const max = poor * 2;
  const pct = value == null ? 0 : Math.min(100, ((value as number) / max) * 100);

  return (
    <Tooltip content={tooltip}>
      <div
        style={{
          background: bg,
          border: `1.5px solid ${color}33`,
          borderRadius: "12px",
          padding: "16px 20px",
          minWidth: "110px",
          flex: "1 1 110px",
          cursor: "default",
        }}
      >
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
            {label}
          </Text>
          <InlineStack align="baseline" gap="100">
            <span style={{ fontSize: "22px", fontWeight: 700, color, lineHeight: 1 }}>
              {displayValue}
            </span>
            {unit && (
              <span style={{ fontSize: "12px", color: "#6d7175" }}>{unit}</span>
            )}
          </InlineStack>
          {/* Mini progress bar */}
          <div
            style={{
              height: "4px",
              background: "#e4e5e7",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: color,
                borderRadius: "2px",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </BlockStack>
      </div>
    </Tooltip>
  );
}
