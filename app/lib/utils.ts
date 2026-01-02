import type { Expense } from "./types";

export const getWeekNumber = (date: Date): number => {
  const startOfYear = new Date(2025, 0, 1);
  const diffInMs = date.getTime() - startOfYear.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffInDays / 7) + 1;
};

export const exportToCSV = (data: any[], filename: string, columns: { key: string; label: string }[]) => {
  const headers = columns.map(c => c.label).join(',');
  const rows = data.map(row => 
    columns.map(c => {
      const value = row[c.key];
      // Handle strings with commas by wrapping in quotes
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value ?? '';
    }).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
};

export const formatCurrency = (value: number, currency: string) => {
  return new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency, 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(value);
};

export const formatPLCurrency = (value: number, currency: string, isDiscount = false) => {
  const formatted = new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency, 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(Math.abs(value));
  return isDiscount && value > 0 ? `(${formatted})` : formatted;
};

export const generateMonthOptions = () => {
  const options = [];
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 2; year <= currentYear + 1; year++) {
    for (let month = 1; month <= 12; month++) {
      const value = `${year}-${String(month).padStart(2, '0')}`;
      const label = new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      options.push({ label, value });
    }
  }
  return options;
};

export const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
};

export const getMonthlyEquivalent = (expense: Expense) => {
  switch (expense.frequency) {
    case "one-time": return expense.amount;
    case "monthly": return expense.amount;
    case "quarterly": return expense.amount / 3;
    case "annual": return expense.amount / 12;
    default: return expense.amount;
  }
};

export const calcLift = (current: number, previous: number, isMultiYear: boolean) => {
  if (isMultiYear) return undefined;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};
