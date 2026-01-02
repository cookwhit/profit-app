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
import { formatPLCurrency, exportToCSV } from "../../lib/utils";

interface ProfitByOrderReportProps {
  currency: string;
}

export function ProfitByOrderReport({ currency }: ProfitByOrderReportProps) {
  const fetcher = useFetcher<{ type: string; orderReport: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const productCostPercent = 40;
  const shippingCostPerOrder = 5;
  const transactionFeePercent = 2.9;
  const transactionFeeFlat = 0.30;

  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByOrder", startDate, endDate }, { method: "POST" });
  };

  const orderData = (fetcher.data?.type === "profitByOrder" ? fetcher.data?.orderReport : []) || [];
  const reportCurrency = (fetcher.data?.type === "profitByOrder" ? fetcher.data?.currency : currency) || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const enrichedData = orderData.map((o: any) => {
    const grossRevenue = o.grossSales + o.shippingRevenue;
    const netRevenue = grossRevenue - o.discounts;
    const cogs = netRevenue * (productCostPercent / 100);
    const grossProfit = netRevenue - cogs;
    const shippingCost = shippingCostPerOrder;
    const transactionFees = (netRevenue * (transactionFeePercent / 100)) + transactionFeeFlat;
    const fulfillmentCost = shippingCost + transactionFees;
    const cm2 = grossProfit - fulfillmentCost;
    const margin = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
    return { ...o, grossRevenue, netRevenue, cogs, grossProfit, fulfillmentCost, cm2, margin };
  });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Order</Text>
          {orderData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(enrichedData.map((row: any) => ({ ...row, date: new Date(row.createdAt).toLocaleDateString('en-US'), margin: row.margin.toFixed(1) })), `profit-by-order-${startDate}-${endDate}`, [
              { key: 'orderName', label: 'Order' },
              { key: 'date', label: 'Date' },
              { key: 'grossRevenue', label: 'Gross Revenue' },
              { key: 'discounts', label: 'Discounts' },
              { key: 'returns', label: 'Returns' },
              { key: 'netRevenue', label: 'Net Revenue' },
              { key: 'cogs', label: 'COGS' },
              { key: 'grossProfit', label: 'Gross Profit' },
              { key: 'fulfillmentCost', label: 'Fulfillment' },
              { key: 'cm2', label: 'CM2' },
              { key: 'margin', label: 'Margin %' },
            ])}>Export CSV</Button>
          )}
        </InlineStack>
        <InlineStack gap="400" align="start" blockAlign="end" wrap>
          <Box minWidth="150px"><TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" /></Box>
          <Box minWidth="150px"><TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" /></Box>
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {orderData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["Order", "Date", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Fulfill.", "CM2", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedData.map((row: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.orderName}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7177' }}>{new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.discounts || 0, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.returns || 0, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.fulfillmentCost, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.cm2 >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.cm2, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: row.margin >= 20 ? '#008060' : row.margin >= 10 ? '#202223' : '#d72c0d' }}>{row.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by individual order.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && orderData.length === 0 && <Banner tone="info"><p>No orders found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
