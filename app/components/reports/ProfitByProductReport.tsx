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
import { exportToCSV } from "../../lib/utils";

interface ProfitByProductReportProps {
  currency: string;
  productTypes: string[];
  productTags: string[];
}

export function ProfitByProductReport({ currency, productTypes, productTags }: ProfitByProductReportProps) {
  const fetcher = useFetcher<{ type: string; productData: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedType, setSelectedType] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  
  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByProduct", startDate, endDate, productType: selectedType, productTag: selectedTag }, { method: "POST" });
  };

  const productData = fetcher.data?.productData || [];
  const reportCurrency = fetcher.data?.currency || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  const typeOptions = [{ label: "All Types", value: "all" }, ...productTypes.map(t => ({ label: t, value: t }))];
  const tagOptions = [{ label: "All Tags", value: "all" }, ...productTags.map(t => ({ label: t, value: t }))];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Product</Text>
          {productData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(productData.map((row: any) => ({ ...row, margin: row.netRevenue > 0 ? ((row.cm2 / row.netRevenue) * 100).toFixed(1) : '0' })), `profit-by-product-${startDate}-${endDate}`, [
              { key: 'title', label: 'Product' },
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
        <InlineStack gap="300" align="start" blockAlign="end" wrap>
          <TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" />
          <TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" />
          <Select label="Product Type" options={typeOptions} value={selectedType} onChange={setSelectedType} />
          <Select label="Tag" options={tagOptions} value={selectedTag} onChange={setSelectedTag} />
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {productData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["Product", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Fulfill.", "CM2", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productData.map((row: any, i: number) => {
                    const margin = row.netRevenue > 0 ? (row.cm2 / row.netRevenue) * 100 : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.discounts, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.returns || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.fulfillmentCost || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.cm2 >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.cm2 || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: margin >= 20 ? '#008060' : margin >= 10 ? '#202223' : '#d72c0d' }}>{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by product.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && productData.length === 0 && <Banner tone="info"><p>No products found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}
