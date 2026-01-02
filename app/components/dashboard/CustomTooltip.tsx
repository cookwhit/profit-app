import { formatCurrency } from "../../lib/utils";

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  currency: string;
  metric: string;
}

export function CustomTooltip({ active, payload, currency, metric }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = metric === "grossRevenue" ? data.grossRevenue : data.discounts;
    const label = metric === "grossRevenue" ? "Gross Revenue" : "Discounts";
    const color = metric === "grossRevenue" ? "#00d4aa" : "#d72c0d";
    return (
      <div style={{ 
        backgroundColor: "#1a1a2e", 
        border: "1px solid #4a4a6a", 
        borderRadius: "8px", 
        padding: "12px 16px", 
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)" 
      }}>
        <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>Week {data.week}</p>
        <p style={{ color, margin: "4px 0 0 0", fontSize: "18px", fontWeight: 700 }}>
          {formatCurrency(value, currency)}
        </p>
        <p style={{ color: "#8888aa", margin: "4px 0 0 0", fontSize: "12px" }}>
          {label} • {data.orderCount} order{data.orderCount !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
}
