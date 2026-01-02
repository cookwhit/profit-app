import { useState } from "react";
import {
  Card,
  BlockStack,
  Box,
  InlineStack,
  Text,
  Select,
  Banner,
} from "@shopify/polaris";
import type { Expense } from "../../lib/types";
import { EXPENSE_CATEGORIES, FREQUENCY_LABELS } from "../../lib/constants";
import { getMonthlyEquivalent } from "../../lib/utils";

interface ExpensesReportProps {
  expenses: Expense[];
  currency: string;
}

export function ExpensesReport({ expenses, currency }: ExpensesReportProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  
  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  // Group expenses by category
  const expensesByCategory = EXPENSE_CATEGORIES.map(cat => {
    const categoryExpenses = expenses.filter(e => e.category === cat.value);
    const monthlyTotal = categoryExpenses.reduce((sum, e) => sum + getMonthlyEquivalent(e), 0);
    const annualTotal = monthlyTotal * 12;
    return {
      category: cat.label,
      categoryKey: cat.value,
      expenses: categoryExpenses,
      monthlyTotal,
      annualTotal,
    };
  }).filter(c => c.expenses.length > 0);

  const totalMonthly = expenses.reduce((sum, e) => sum + getMonthlyEquivalent(e), 0);
  const totalAnnual = totalMonthly * 12;

  // Monthly breakdown for the year
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyBreakdown = months.map((month) => {
    return {
      month,
      total: totalMonthly,
    };
  });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Expenses Report</Text>
          <Select 
            label="Year" 
            labelHidden 
            options={[
              { label: "2025", value: "2025" },
              { label: "2024", value: "2024" },
              { label: "2023", value: "2023" },
            ]} 
            value={selectedYear} 
            onChange={setSelectedYear} 
          />
        </InlineStack>

        {expenses.length === 0 ? (
          <Banner tone="info">
            <p>No expenses have been added yet. Go to Cost Management → Operating Expenses to add your business expenses.</p>
          </Banner>
        ) : (
          <>
            {/* Summary Cards */}
            <InlineStack gap="400">
              <Box minWidth="0" width="100%">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Monthly Expenses</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">{formatPLCurrency(totalMonthly, currency)}</Text>
                  </BlockStack>
                </Card>
              </Box>
              <Box minWidth="0" width="100%">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Annual Projection</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">{formatPLCurrency(totalAnnual, currency)}</Text>
                  </BlockStack>
                </Card>
              </Box>
              <Box minWidth="0" width="100%">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">Expense Items</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">{expenses.length}</Text>
                  </BlockStack>
                </Card>
              </Box>
            </InlineStack>

            {/* Monthly Trend */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Monthly Breakdown ({selectedYear})</Text>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                      {months.map(m => (
                        <th key={m} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: '#202223' }}>{m}</th>
                      ))}
                      <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: '#202223' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e1e3e5' }}>
                      {monthlyBreakdown.map((m, i) => (
                        <td key={i} style={{ padding: '10px 8px', textAlign: 'center' }}>{formatPLCurrency(m.total, currency)}</td>
                      ))}
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{formatPLCurrency(totalAnnual, currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </BlockStack>

            {/* By Category */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Expenses by Category</Text>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                      {["Category", "Items", "Monthly", "Annual", "% of Total"].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expensesByCategory.map((cat, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{cat.category}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{cat.expenses.length}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(cat.monthlyTotal, currency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(cat.annualTotal, currency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totalMonthly > 0 ? ((cat.monthlyTotal / totalMonthly) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#f6f6f7', fontWeight: 600 }}>
                      <td style={{ padding: '10px 12px' }}>Total</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{expenses.length}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(totalMonthly, currency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(totalAnnual, currency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </BlockStack>

            {/* Detailed List */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">All Expenses</Text>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                      {["Name", "Category", "Amount", "Frequency", "Monthly Equiv."].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, color: '#202223' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{expense.name}</td>
                        <td style={{ padding: '10px 12px', color: '#6b7177' }}>{EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(expense.amount, currency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{FREQUENCY_LABELS[expense.frequency] || expense.frequency}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>{formatPLCurrency(getMonthlyEquivalent(expense), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
