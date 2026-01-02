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

interface ProfitByChannelReportProps {
  currency: string;
}

export function ProfitByChannelReport({ currency }: ProfitByChannelReportProps) {
  const fetcher = useFetcher<{ type: string; channelReport: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const productCostPercent = 40;
  const shippingCostPerOrder = 5;
  const transactionFeePercent = 2.9;
  const transactionFeeFlat = 0.30;

  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByChannel", startDate, endDate }, { method: "POST" });
  };

  const channelData = (fetcher.data?.type === "profitByChannel" ? fetcher.data?.channelReport : []) || [];
  const reportCurrency = (fetcher.data?.type === "profitByChannel" ? fetcher.data?.currency : currency) || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const enrichedData = channelData.map((c: any) => {
    const netRevenue = c.grossRevenue - c.discounts;
    const cogs = netRevenue * (productCostPercent / 100);
    const grossProfit = netRevenue - cogs;
    const shippingCost = c.orderCount * shippingCostPerOrder;
    const transactionFees = (netRevenue * (transactionFeePercent / 100)) + (c.orderCount * transactionFeeFlat);
    const fulfillmentCost = shippingCost + transactionFees;
    const cm2 = grossProfit - fulfillmentCost;
    const margin = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
    return { ...c, netRevenue, cogs, grossProfit, fulfillmentCost, cm2, margin };
  });

  const totals = enrichedData.reduce((acc: any, c: any) => ({
    grossRevenue: acc.grossRevenue + c.grossRevenue,
    discounts: acc.discounts + c.discounts,
    netRevenue: acc.netRevenue + c.netRevenue,
    cogs: acc.cogs + c.cogs,
    grossProfit: acc.grossProfit + c.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + c.fulfillmentCost,
    cm2: acc.cm2 + c.cm2,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0 });
  const totalMargin = totals.netRevenue > 0 ? (totals.cm2 / totals.netRevenue) * 100 : 0;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Channel</Text>
          {channelData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(enrichedData.map((row: any) => ({ ...row, margin: row.margin.toFixed(1) })), `profit-by-channel-${startDate}-${endDate}`, [
              { key: 'channel', label: 'Channel' },
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
        
        {channelData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["Channel", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Fulfill.", "CM2", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedData.map((row: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.channel}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue || 0, reportCurrency)}</td>
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
                  <tr style={{ backgroundColor: '#f6f6f7', fontWeight: 600 }}>
                    <td style={{ padding: '10px 12px' }}>Total</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(totals.grossRevenue, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(totals.discounts, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(0, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(totals.netRevenue, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(totals.cogs, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: totals.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(totals.grossProfit, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(totals.fulfillmentCost, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: totals.cm2 >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(totals.cm2, reportCurrency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: totalMargin >= 20 ? '#008060' : totalMargin >= 10 ? '#202223' : '#d72c0d' }}>{totalMargin.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by sales channel.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && channelData.length === 0 && <Banner tone="info"><p>No orders found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
