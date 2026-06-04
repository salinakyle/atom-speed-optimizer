import { InlineStack, Text, BlockStack } from "@shopify/polaris";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <InlineStack align="space-between" blockAlign="start" wrap={false}>
      <BlockStack gap="100" inlineSize="75%">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
        <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
      </BlockStack>
      <button
        role="switch"
        aria-checked={checked}
        onClick={disabled ? undefined : onChange}
        disabled={disabled}
        style={{
          position: "relative",
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          border: "none",
          background: disabled ? "#e4e5e7" : checked ? "#00a47c" : "#c9cccf",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 0.2s ease",
          flexShrink: 0,
          outline: "none",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </InlineStack>
  );
}
