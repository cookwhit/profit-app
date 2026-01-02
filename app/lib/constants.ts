import type { Gateway } from "./types";

// Known gateways that match Shopify API gateway names
export const KNOWN_GATEWAYS: Gateway[] = [
  { id: "amazon_payments", name: "Amazon Pay", apiName: "amazon_payments", defaultRate: 2.9, defaultFee: 0.30 },
  { id: "klarna", name: "Klarna", apiName: "klarna", defaultRate: 3.29, defaultFee: 0.30 },
  { id: "afterpay", name: "Afterpay", apiName: "afterpay", defaultRate: 6.0, defaultFee: 0.30 },
  { id: "affirm", name: "Affirm", apiName: "affirm", defaultRate: 5.99, defaultFee: 0.30 },
  { id: "sezzle", name: "Sezzle", apiName: "sezzle", defaultRate: 6.0, defaultFee: 0.30 },
  { id: "zip", name: "Zip (Quadpay)", apiName: "zip", defaultRate: 6.0, defaultFee: 0.30 },
  { id: "clearpay", name: "Clearpay", apiName: "clearpay", defaultRate: 6.0, defaultFee: 0.30 },
  { id: "authorize_net", name: "Authorize.net", apiName: "authorize_net", defaultRate: 2.9, defaultFee: 0.30 },
  { id: "braintree", name: "Braintree", apiName: "braintree", defaultRate: 2.59, defaultFee: 0.49 },
  { id: "square", name: "Square", apiName: "square", defaultRate: 2.9, defaultFee: 0.30 },
  { id: "2checkout", name: "2Checkout", apiName: "2checkout", defaultRate: 3.5, defaultFee: 0.35 },
  { id: "worldpay", name: "Worldpay", apiName: "worldpay", defaultRate: 2.75, defaultFee: 0.30 },
];

export const EXPENSE_CATEGORIES = [
  { label: "Advertising & Marketing", value: "advertising" },
  { label: "Software & Subscriptions", value: "software" },
  { label: "Rent & Warehousing", value: "rent" },
  { label: "Payroll & Contractors", value: "payroll" },
  { label: "Professional Services", value: "professional" },
  { label: "Shipping & Fulfillment", value: "shipping" },
  { label: "Other", value: "other" },
];

export const FREQUENCY_OPTIONS = [
  { label: "One-time", value: "one-time" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Annual", value: "annual" },
];

export const FREQUENCY_LABELS: Record<string, string> = {
  "one-time": "One-time",
  "monthly": "Monthly",
  "quarterly": "Quarterly",
  "annual": "Annual",
};

// Default cost assumptions
export const DEFAULT_COST_SETTINGS = {
  productCostPercent: 40,
  shippingCostPerOrder: 5,
  transactionFeePercent: 2.9,
  transactionFeeFlat: 0.30,
};
