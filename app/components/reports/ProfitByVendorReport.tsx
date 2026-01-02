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

interface ProfitByVendorReportProps {
  currency: string;
}

export function ProfitByVendorReport({ currency }: ProfitByVendorReportProps) {
  const fetcher = useFetcher<{ type: string; vendorData: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByVendor", startDate, endDate }, { method: "POST" });
  };

  const vendorData = fetcher.data?.vendorData || [];
  const reportCurrency = fetcher.data?.currency || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Vendor</Text>
          {vendorData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(vendorData.map((row: any) => ({ ...row, vendor: row.vendor || '(No vendor)', margin: row.netRevenue > 0 ? ((row.grossProfit / row.netRevenue) * 100).toFixed(1) : '0' })), `profit-by-vendor-${startDate}-${endDate}`, [
              { key: 'vendor', label: 'Vendor' },
              { key: 'productCount', label: 'Products' },
              { key: 'orderCount', label: 'Orders' },
              { key: 'grossRevenue', label: 'Gross Revenue' },
              { key: 'discounts', label: 'Discounts' },
              { key: 'netRevenue', label: 'Net Revenue' },
              { key: 'cogs', label: 'COGS' },
              { key: 'grossProfit', label: 'Gross Profit' },
              { key: 'margin', label: 'Margin %' },
            ])}>Export CSV</Button>
          )}
        </InlineStack>
        <InlineStack gap="300" align="start" blockAlign="end">
          <TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" />
          <TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" />
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {vendorData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["Vendor", "Products", "Orders", "Gross Rev", "Discounts", "Net Rev", "COGS", "Gross Profit", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendorData.map((row: any, i: number) => {
                    const margin = row.netRevenue > 0 ? (row.grossProfit / row.netRevenue) * 100 : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.vendor || "(No vendor)"}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{row.productCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{row.orderCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.discounts, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: margin >= 50 ? '#008060' : margin >= 30 ? '#202223' : '#d72c0d' }}>{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by vendor.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && vendorData.length === 0 && <Banner tone="info"><p>No vendors found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
