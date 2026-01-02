// Core data types for SimplyTheBest

export interface WeeklyRevenue {
  week: number;
  weekLabel: string;
  grossRevenue: number;
  discounts: number;
  orderCount: number;
}

export interface PLPeriod {
  period: string;
  periodLabel: string;
  grossSales: number;
  discounts: number;
  netSales: number;
  shippingRevenue: number;
  netRevenue: number;
  orderCount: number;
  itemCount: number;
}

export interface LTVBucket {
  range: string;
  count: number;
  min: number;
  max: number;
}

export interface WeeklyAcquisition {
  week: number;
  weekLabel: string;
  avgCAC: number;
  newBuyers: number;
}

export interface DailyAcquisition {
  date: string;
  dateLabel: string;
  avgCAC: number;
  newBuyers: number;
}

export interface Product {
  id: string;
  title: string;
  productType: string;
  tags: string[];
}

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: "one-time" | "monthly" | "quarterly" | "annual";
  startDate: string;
  endDate?: string;
}

export interface ShippingSettings {
  method: "flat" | "per-item" | "none";
  flatRate: number;
  perItemRate: number;
}

export interface TransactionFeeSettings {
  quickSetup: string;
  shopifyPayments: { rate: number; fixedFee: number };
  paypal: { rate: number; fixedFee: number; enabled: boolean };
  stripe: { rate: number; fixedFee: number; enabled: boolean };
  shopifySurcharge: number;
  usesShopifyPayments: boolean;
  additionalGateways: Array<{ id: string; name: string; apiName: string; rate: number; fixedFee: number }>;
}

export interface DashboardData {
  type: string; 
  chartData: WeeklyRevenue[]; 
  dailyChartData: { date: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  monthlyChartData: { month: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  quarterlyChartData: { quarter: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  currency: string; 
  totalRevenue: number; 
  totalDiscounts: number;
  totalOrders: number; 
  totalShippingRevenue: number; 
  totalItemCount: number;
  totalCustomers: number;
  acquisitionData: WeeklyAcquisition[]; 
  dailyAcquisitionData: DailyAcquisition[];
  channels: string[];
  topProducts: { productId: string; title: string; netRevenue: number; aov: number; avgDiscount: number; grossProfitRate: number; orderCount: number }[];
  totalRefunds: number;
}

export interface Gateway {
  id: string;
  name: string;
  apiName: string;
  defaultRate: number;
  defaultFee: number;
}
