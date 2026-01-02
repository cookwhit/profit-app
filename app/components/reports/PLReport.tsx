import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Card,
  BlockStack,
  Box,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Banner,
} from "@shopify/polaris";
import type { PLPeriod } from "../../lib/types";
import { formatPLCurrency } from "../../lib/utils";

interface PLReportProps {
  currency: string;
}

export function PLReport({ currency }: PLReportProps) {
  const fetcher = useFetcher<{ type: string; plData: PLPeriod[]; currency: string; totalRefunds?: number }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  
  // Cost settings - in a real implementation these would come from saved settings
  const [productCostPercent] = useState(40);
  const [shippingCostMethod] = useState<"flat" | "per-item">("flat");
  const [flatShippingCost] = useState(5);
  const [perItemShippingCost] = useState(2);
  const [transactionFeePercent] = useState(2.9);
  const [transactionFeeFlat] = useState(0.30);
  const [adSpend] = useState(0);
  const [opex] = useState(0);

  const handleRunReport = () => {
    fetcher.submit({ actionType: "pl", startDate, endDate, groupBy }, { method: "POST" });
  };

  const plData = (fetcher.data?.type === "pl" ? fetcher.data?.plData : []) || [];
  const totalRefunds = (fetcher.data?.type === "pl" ? fetcher.data?.totalRefunds : 0) || 0;
  const reportCurrency = (fetcher.data?.type === "pl" ? fetcher.data?.currency : currency) || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const groupByOptions = [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
    { label: "Quarter", value: "quarter" },
    { label: "Year", value: "year" },
  ];

  // Calculate derived metrics for each period based on new structure
  const enrichedData = plData.map(m => {
    const grossRevenue = m.grossSales + m.shippingRevenue;
    const returnsPerPeriod = totalRefunds / (plData.length || 1);
    const netRevenue = grossRevenue - m.discounts - returnsPerPeriod;
    const cogs = (m.grossSales - m.discounts) * (productCostPercent / 100);
    const grossProfit = netRevenue - cogs;
    const grossProfitPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const shippingCost = shippingCostMethod === "flat" 
      ? m.orderCount * flatShippingCost 
      : m.itemCount * perItemShippingCost;
    const transactionFees = (netRevenue * (transactionFeePercent / 100)) + (m.orderCount * transactionFeeFlat);
    const fulfillmentCost = shippingCost + transactionFees;
    const cm2 = grossProfit - fulfillmentCost;
    const cm2Percent = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
    const adSpendPerPeriod = adSpend / (plData.length || 1);
    const cm3 = cm2 - adSpendPerPeriod;
    const cm3Percent = netRevenue > 0 ? (cm3 / netRevenue) * 100 : 0;
    const opexPerPeriod = opex / (plData.length || 1);
    const netProfit = cm3 - opexPerPeriod;
    const netProfitPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
    
    return {
      ...m,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      returns: Math.round(returnsPerPeriod * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossProfitPercent: Math.round(grossProfitPercent * 10) / 10,
      shippingCost: Math.round(shippingCost * 100) / 100,
      transactionFees: Math.round(transactionFees * 100) / 100,
      fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
      cm2: Math.round(cm2 * 100) / 100,
      cm2Percent: Math.round(cm2Percent * 10) / 10,
      adSpendPerPeriod: Math.round(adSpendPerPeriod * 100) / 100,
      cm3: Math.round(cm3 * 100) / 100,
      cm3Percent: Math.round(cm3Percent * 10) / 10,
      opexPerPeriod: Math.round(opexPerPeriod * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netProfitPercent: Math.round(netProfitPercent * 10) / 10,
    };
  });

  const totals = enrichedData.reduce((acc, m) => ({
    grossRevenue: acc.grossRevenue + m.grossRevenue,
    discounts: acc.discounts + m.discounts,
    returns: acc.returns + m.returns,
    netRevenue: acc.netRevenue + m.netRevenue,
    cogs: acc.cogs + m.cogs,
    grossProfit: acc.grossProfit + m.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + m.fulfillmentCost,
    cm2: acc.cm2 + m.cm2,
    adSpend: acc.adSpend + m.adSpendPerPeriod,
    cm3: acc.cm3 + m.cm3,
    opex: acc.opex + m.opexPerPeriod,
    netProfit: acc.netProfit + m.netProfit,
  }), { grossRevenue: 0, discounts: 0, returns: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0, adSpend: 0, cm3: 0, opex: 0, netProfit: 0 });
  
  const totalNetProfitPercent = totals.netRevenue > 0 ? (totals.netProfit / totals.netRevenue) * 100 : 0;

  const buildTableRows = () => {
    if (enrichedData.length === 0) return [];
    
    return [
      { label: "Gross Revenue", values: enrichedData.map(m => formatPLCurrency(m.grossRevenue, reportCurrency)), total: formatPLCurrency(totals.grossRevenue, reportCurrency), isHeader: false, indent: 0 },
      { label: "Discounts", values: enrichedData.map(m => formatPLCurrency(m.discounts, reportCurrency, true)), total: formatPLCurrency(totals.discounts, reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Returns / Refunds", values: enrichedData.map(m => formatPLCurrency(m.returns, reportCurrency, true)), total: formatPLCurrency(totals.returns, reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Net Revenue", values: enrichedData.map(m => formatPLCurrency(m.netRevenue, reportCurrency)), total: formatPLCurrency(totals.netRevenue, reportCurrency), isHeader: true, indent: 0, highlight: true },
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      { label: "COGS", values: enrichedData.map(m => formatPLCurrency(m.cogs, reportCurrency, true)), total: formatPLCurrency(totals.cogs, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "Gross Profit (CM1)", values: enrichedData.map(m => `${formatPLCurrency(m.grossProfit, reportCurrency)} (${m.grossProfitPercent}%)`), total: `${formatPLCurrency(totals.grossProfit, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.grossProfit / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      { label: "Order Fulfillment Costs", values: enrichedData.map(m => formatPLCurrency(m.fulfillmentCost, reportCurrency, true)), total: formatPLCurrency(totals.fulfillmentCost, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "Shipping & Handling", values: enrichedData.map(m => formatPLCurrency(m.shippingCost, reportCurrency, true)), total: formatPLCurrency(enrichedData.reduce((sum, m) => sum + m.shippingCost, 0), reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Transaction Fees", values: enrichedData.map(m => formatPLCurrency(m.transactionFees, reportCurrency, true)), total: formatPLCurrency(enrichedData.reduce((sum, m) => sum + m.transactionFees, 0), reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "CM2", values: enrichedData.map(m => `${formatPLCurrency(m.cm2, reportCurrency)} (${m.cm2Percent}%)`), total: `${formatPLCurrency(totals.cm2, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.cm2 / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      { label: "Ad Spend", values: enrichedData.map(m => formatPLCurrency(m.adSpendPerPeriod, reportCurrency, true)), total: formatPLCurrency(totals.adSpend, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "CM3", values: enrichedData.map(m => `${formatPLCurrency(m.cm3, reportCurrency)} (${m.cm3Percent}%)`), total: `${formatPLCurrency(totals.cm3, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.cm3 / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      { label: "OpEx", values: enrichedData.map(m => formatPLCurrency(m.opexPerPeriod, reportCurrency, true)), total: formatPLCurrency(totals.opex, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "Net Profit", values: enrichedData.map(m => `${formatPLCurrency(m.netProfit, reportCurrency)} (${m.netProfitPercent}%)`), total: `${formatPLCurrency(totals.netProfit, reportCurrency)} (${totalNetProfitPercent.toFixed(1)}%)`, isHeader: true, indent: 0, highlight: true, isProfit: true },
    ];
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">P&L Report</Text>
        <InlineStack gap="400" align="start" blockAlign="end" wrap>
          <Box minWidth="150px">
            <TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" />
          </Box>
          <Box minWidth="150px">
            <TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" />
          </Box>
          <Box minWidth="120px">
            <Select label="Group By" options={groupByOptions} value={groupBy} onChange={(v) => setGroupBy(v as any)} />
          </Box>
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {plData.length > 0 && (
          <>
            <Box paddingBlockStart="200">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                      {["", ...enrichedData.map(m => m.periodLabel), "Total"].map((heading, i, arr) => (
                        <th key={i} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap', backgroundColor: i === arr.length - 1 ? '#f6f6f7' : 'transparent' }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buildTableRows().map((row: any, rowIndex) => (
                      <tr key={rowIndex} style={{ 
                        borderBottom: row.isSpacer ? 'none' : '1px solid #e1e3e5', 
                        backgroundColor: row.highlight ? '#f0f7ff' : row.isHeader ? '#f6f6f7' : 'transparent',
                        height: row.isSpacer ? '12px' : 'auto',
                      }}>
                        {[row.label, ...row.values, row.total].map((cell: string, cellIndex: number, cellArr: string[]) => (
                          <td key={cellIndex} style={{ 
                            padding: row.isSpacer ? '0' : '12px 16px', 
                            paddingLeft: cellIndex === 0 ? `${16 + (row.indent || 0) * 20}px` : '16px',
                            textAlign: cellIndex === 0 ? 'left' : 'right', 
                            fontWeight: row.isHeader || cellIndex === cellArr.length - 1 ? 600 : 400, 
                            color: row.isNegative && cellIndex > 0 ? '#d72c0d' : row.isProfit && cellIndex > 0 ? '#008060' : '#202223',
                            fontSize: row.indent ? '13px' : '14px',
                            whiteSpace: 'nowrap',
                            backgroundColor: cellIndex === cellArr.length - 1 && !row.isSpacer ? '#f6f6f7' : 'transparent',
                          }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
            
            <Card background="bg-surface-secondary">
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Metric Definitions</Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm"><strong>Gross Revenue</strong> = Product sales + Shipping revenue (top line)</Text>
                  <Text as="p" variant="bodySm"><strong>Net Revenue</strong> = Gross Revenue − Discounts − Returns/Refunds</Text>
                  <Text as="p" variant="bodySm"><strong>Gross Profit (CM1)</strong> = Net Revenue − COGS</Text>
                  <Text as="p" variant="bodySm"><strong>CM2</strong> = Gross Profit − Order Fulfillment Costs (shipping, handling, Shopify fees)</Text>
                  <Text as="p" variant="bodySm"><strong>CM3</strong> = CM2 − Ad Spend</Text>
                  <Text as="p" variant="bodySm"><strong>Net Profit</strong> = CM3 − OpEx (operating expenses)</Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to generate your P&L.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && plData.length === 0 && <Banner tone="info"><p>No orders found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
