import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Card,
  BlockStack,
  Box,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { exportToCSV } from "../../lib/utils";

interface ProfitBySKUReportProps {
  currency: string;
}

export function ProfitBySKUReport({ currency }: ProfitBySKUReportProps) {
  const fetcher = useFetcher<{ type: string; skuData: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitBySKU", startDate, endDate }, { method: "POST" });
  };

  const skuData = fetcher.data?.skuData || [];
  const reportCurrency = fetcher.data?.currency || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by SKU</Text>
          {skuData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(skuData.map((row: any) => ({ ...row, sku: row.sku || '(No SKU)', margin: row.netRevenue > 0 ? (((row.cm2 || 0) / row.netRevenue) * 100).toFixed(1) : '0' })), `profit-by-sku-${startDate}-${endDate}`, [
              { key: 'sku', label: 'SKU' },
              { key: 'title', label: 'Product' },
              { key: 'grossRevenue', label: 'Gross Revenue' },
              { key: 'discounts', label: 'Discounts' },
              { key: 'netRevenue', label: 'Net Revenue' },
              { key: 'cogs', label: 'COGS' },
              { key: 'grossProfit', label: 'Gross Profit' },
              { key: 'cm2', label: 'CM2' },
              { key: 'margin', label: 'Margin %' },
            ])}>Export CSV</Button>
          )}
        </InlineStack>
        <InlineStack gap="300" align="start" blockAlign="end">
          <TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" />
          <TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" />
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {skuData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["SKU", "Product", "Gross Rev", "Discounts", "Net Rev", "COGS", "Gross Profit", "CM2", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skuData.map((row: any, i: number) => {
                    const margin = row.netRevenue > 0 ? ((row.cm2 || 0) / row.netRevenue) * 100 : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, fontFamily: 'monospace' }}>{row.sku || "(No SKU)"}</td>
                        <td style={{ padding: '10px 12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7177' }}>{row.title}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.discounts, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: (row.cm2 || 0) >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.cm2 || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: margin >= 20 ? '#008060' : margin >= 10 ? '#202223' : '#d72c0d' }}>{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by SKU.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && skuData.length === 0 && <Banner tone="info"><p>No SKUs found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
