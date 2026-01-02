import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, BlockStack, Box, Text } from "@shopify/polaris";

interface MetricCardProps {
  label: string;
  value: string;
  tooltip: string;
  formula?: string;
  lift?: number;
  liftInverted?: boolean;
  disabled?: boolean;
}

export function MetricCard({ 
  label, 
  value, 
  tooltip, 
  formula, 
  lift, 
  liftInverted = false, 
  disabled = false 
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  
  const liftColor = lift === undefined 
    ? undefined 
    : (liftInverted 
        ? (lift > 0 ? "#d72c0d" : "#008060") 
        : (lift > 0 ? "#008060" : "#d72c0d"));
  const liftPrefix = lift !== undefined && lift > 0 ? "+" : "";
  
  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.bottom + 8, left: rect.left });
    }
    setShowTooltip(true);
  };
  
  const tooltipContent = showTooltip && typeof document !== 'undefined' ? createPortal(
    <div style={{ 
      position: 'fixed', 
      top: tooltipPos.top, 
      left: tooltipPos.left, 
      backgroundColor: '#fff', 
      color: '#202223', 
      padding: '16px', 
      borderRadius: '12px', 
      fontSize: '13px', 
      width: '280px',
      zIndex: 999999,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      border: '1px solid #e1e3e5'
    }}>
      <p style={{ 
        margin: 0, 
        fontWeight: 600, 
        fontSize: '14px', 
        borderBottom: '1px dashed #e1e3e5', 
        paddingBottom: '8px', 
        marginBottom: '8px' 
      }}>
        {label}
      </p>
      {formula && (
        <p style={{ margin: '0 0 8px 0', color: '#6b7177', fontSize: '12px' }}>
          {formula}
        </p>
      )}
      <p style={{ margin: 0, color: '#202223', lineHeight: '1.5' }}>{tooltip}</p>
    </div>,
    document.body
  ) : null;
  
  return (
    <Box minWidth="0" width="100%">
      <Card>
        <BlockStack gap="200">
          <div 
            ref={triggerRef}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px', 
              cursor: 'help', 
              opacity: disabled ? 0.5 : 1 
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Text as="p" variant="bodyMd" tone="subdued">{label}</Text>
            <span style={{ color: '#8c9196', fontSize: '12px' }}>ⓘ</span>
          </div>
          {tooltipContent}
          <Text as="p" variant="headingLg" fontWeight="bold" tone={disabled ? "subdued" : undefined}>
            {value}
          </Text>
          {lift !== undefined && !disabled && (
            <Text as="p" variant="bodySm" fontWeight="medium">
              <span style={{ color: liftColor }}>{liftPrefix}{lift.toFixed(1)}%</span>
              <span style={{ color: '#8c9196', marginLeft: '4px' }}>vs LY</span>
            </Text>
          )}
          {disabled && (
            <Text as="p" variant="bodySm" tone="subdued">Coming soon</Text>
          )}
        </BlockStack>
      </Card>
    </Box>
  );
}
