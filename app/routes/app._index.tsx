import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Banner,
  Tabs,
  Select,
  Button,
  TextField,
  Modal,
  FormLayout,
  Icon,
  Badge,
  ProgressBar,
  Divider,
} from "@shopify/polaris";
import {
  SearchIcon,
  EditIcon,
  DeleteIcon,
  PlusIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface WeeklyRevenue {
  week: number;
  weekLabel: string;
  grossRevenue: number;
  discounts: number;
  orderCount: number;
}

interface PLPeriod {
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

interface LTVBucket {
  range: string;
  count: number;
  min: number;
  max: number;
}

interface WeeklyAcquisition {
  week: number;
  weekLabel: string;
  avgCAC: number;
  newBuyers: number;
}

interface DailyAcquisition {
  date: string;
  dateLabel: string;
  avgCAC: number;
  newBuyers: number;
}

interface Product {
  id: string;
  title: string;
  productType: string;
  tags: string[];
}

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: "one-time" | "monthly" | "quarterly" | "annual";
  startDate: string;
  endDate?: string;
}

interface ShippingSettings {
  method: "flat" | "per-item" | "none";
  flatRate: number;
  perItemRate: number;
}

interface TransactionFeeSettings {
  quickSetup: string;
  shopifyPayments: { rate: number; fixedFee: number };
  paypal: { rate: number; fixedFee: number; enabled: boolean };
  stripe: { rate: number; fixedFee: number; enabled: boolean };
  shopifySurcharge: number;
  usesShopifyPayments: boolean;
  additionalGateways: Array<{ id: string; name: string; apiName: string; rate: number; fixedFee: number }>;
}

interface ShippingCostEntry {
  orderId: string;
  orderName: string;
  shippingCost: number;
  source: "csv" | "manual";
  uploadedAt: string;
}

// Known gateways that match Shopify API gateway names
const KNOWN_GATEWAYS = [
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

const getWeekNumber = (date: Date): number => {
  const startOfYear = new Date(2025, 0, 1);
  const diffInMs = date.getTime() - startOfYear.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffInDays / 7) + 1;
};

const exportToCSV = (data: any[], filename: string, columns: { key: string; label: string }[]) => {
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  if (actionType === "dashboard") {
    const productId = formData.get("productId") as string | null;
    const productType = formData.get("productType") as string | null;
    const channel = formData.get("channel") as string | null;
    const startDate = formData.get("startDate") as string || "2025-01-01";
    const endDate = formData.get("endDate") as string || new Date().toISOString().split('T')[0];
    
    // Build query string - use < next day to include full end date
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];
    
    let queryParts = [`created_at:>=${startDate}`, `created_at:<${endDateExclusive}`, "financial_status:paid"];
    
    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  createdAt
                  customer { id }
                  channelInformation { channelDefinition { channelName } }
                  totalPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount } }
                  subtotalPriceSet { shopMoney { amount } }
                  totalShippingPriceSet { shopMoney { amount } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        product { id title productType }
                        quantity
                        originalTotalSet { shopMoney { amount } }
                        totalDiscountSet { shopMoney { amount } }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: queryParts.join(" AND "), cursor } }
      );

      const data = await response.json();
      const orders = data.data?.orders?.edges || [];
      allOrders = [...allOrders, ...orders];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }
    
    // Collect unique channels for filter dropdown
    const channels = new Set<string>();
    for (const edge of allOrders) {
      const channelName = edge.node.channelInformation?.channelDefinition?.channelName || "Online Store";
      channels.add(channelName);
    }

    // Filter orders by channel (client-side since Shopify doesn't support channel in query)
    if (channel && channel !== "all") {
      allOrders = allOrders.filter(edge => {
        const orderChannel = edge.node.channelInformation?.channelDefinition?.channelName || "Online Store";
        return orderChannel === channel;
      });
    }

    const weeklyData: Map<number, { grossRevenue: number; discounts: number; orderCount: number; shippingRevenue: number; itemCount: number }> = new Map();
    const dailyData: Map<string, { grossRevenue: number; discounts: number; orderCount: number; shippingRevenue: number; itemCount: number }> = new Map();
    const monthlyData: Map<string, { grossRevenue: number; discounts: number; orderCount: number; shippingRevenue: number; itemCount: number }> = new Map();
    const quarterlyData: Map<string, { grossRevenue: number; discounts: number; orderCount: number; shippingRevenue: number; itemCount: number }> = new Map();
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const maxWeek = currentYear === 2025 ? getWeekNumber(now) : 53;

    for (let i = 1; i <= maxWeek; i++) {
      weeklyData.set(i, { grossRevenue: 0, discounts: 0, orderCount: 0, shippingRevenue: 0, itemCount: 0 });
    }

    let totalShippingRevenue = 0;
    let totalItemCount = 0;

    for (const edge of allOrders) {
      const order = edge.node;
      const createdAt = new Date(order.createdAt);
      const weekNum = getWeekNumber(createdAt);
      // Extract date from ISO string directly to avoid timezone issues
      // Shopify returns dates in store timezone, we want to preserve that
      const dayKey = order.createdAt.split('T')[0];
      const monthKey = dayKey.substring(0, 7); // YYYY-MM
      const [year, month] = monthKey.split('-').map(Number);
      const quarterKey = `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
      
      let grossRevenue = 0;
      let discounts = 0;
      let shippingRevenue = 0;
      let itemCount = 0;

      // Filter by specific product OR product type OR show all
      const hasProductFilter = productId && productId !== "all";
      const hasProductTypeFilter = productType && productType !== "all";
      
      if (hasProductFilter || hasProductTypeFilter) {
        // Get order-level totals for pro-rating discounts
        const orderSubtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
        const orderTotalDiscount = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
        const lineItemCount = order.lineItems?.edges?.length || 0;
        
        for (const lineItemEdge of order.lineItems.edges) {
          const lineItem = lineItemEdge.node;
          const matchesProduct = !hasProductFilter || lineItem.product?.id === productId;
          const matchesType = !hasProductTypeFilter || lineItem.product?.productType === productType;
          
          if (matchesProduct && matchesType) {
            const lineItemOriginalTotal = parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
            const lineItemDiscount = parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
            
            grossRevenue += lineItemOriginalTotal;
            
            // If line item has its own discount, use it
            // Otherwise, pro-rate the order-level discount based on this item's share of subtotal
            if (lineItemDiscount > 0) {
              discounts += lineItemDiscount;
            } else if (orderTotalDiscount > 0 && orderSubtotal > 0) {
              // For single line item orders, assign full discount
              // For multi-line orders, pro-rate based on item's share of gross revenue
              if (lineItemCount === 1) {
                discounts += orderTotalDiscount;
              } else {
                const lineItemShare = lineItemOriginalTotal / (orderSubtotal + orderTotalDiscount);
                discounts += orderTotalDiscount * lineItemShare;
              }
            }
            
            itemCount += lineItem.quantity || 0;
          }
        }
      } else {
        const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
        discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
        grossRevenue = subtotal + discounts;
        shippingRevenue = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
        itemCount = order.lineItems?.edges?.reduce((sum: number, e: any) => sum + (e.node.quantity || 0), 0) || 0;
      }

      if (grossRevenue > 0 || discounts > 0) {
        // Weekly
        const existingWeek = weeklyData.get(weekNum) || { grossRevenue: 0, discounts: 0, orderCount: 0, shippingRevenue: 0, itemCount: 0 };
        weeklyData.set(weekNum, {
          grossRevenue: existingWeek.grossRevenue + grossRevenue,
          discounts: existingWeek.discounts + discounts,
          orderCount: existingWeek.orderCount + 1,
          shippingRevenue: existingWeek.shippingRevenue + shippingRevenue,
          itemCount: existingWeek.itemCount + itemCount,
        });
        
        // Daily
        const existingDay = dailyData.get(dayKey) || { grossRevenue: 0, discounts: 0, orderCount: 0, shippingRevenue: 0, itemCount: 0 };
        dailyData.set(dayKey, {
          grossRevenue: existingDay.grossRevenue + grossRevenue,
          discounts: existingDay.discounts + discounts,
          orderCount: existingDay.orderCount + 1,
          shippingRevenue: existingDay.shippingRevenue + shippingRevenue,
          itemCount: existingDay.itemCount + itemCount,
        });
        
        // Monthly
        const existingMonth = monthlyData.get(monthKey) || { grossRevenue: 0, discounts: 0, orderCount: 0, shippingRevenue: 0, itemCount: 0 };
        monthlyData.set(monthKey, {
          grossRevenue: existingMonth.grossRevenue + grossRevenue,
          discounts: existingMonth.discounts + discounts,
          orderCount: existingMonth.orderCount + 1,
          shippingRevenue: existingMonth.shippingRevenue + shippingRevenue,
          itemCount: existingMonth.itemCount + itemCount,
        });
        
        // Quarterly
        const existingQuarter = quarterlyData.get(quarterKey) || { grossRevenue: 0, discounts: 0, orderCount: 0, shippingRevenue: 0, itemCount: 0 };
        quarterlyData.set(quarterKey, {
          grossRevenue: existingQuarter.grossRevenue + grossRevenue,
          discounts: existingQuarter.discounts + discounts,
          orderCount: existingQuarter.orderCount + 1,
          shippingRevenue: existingQuarter.shippingRevenue + shippingRevenue,
          itemCount: existingQuarter.itemCount + itemCount,
        });
        
        totalShippingRevenue += shippingRevenue;
        totalItemCount += itemCount;
      }
    }

    // Cost assumptions for calculated metrics
    const costPercent = 40;
    const shippingCostPerOrder = 5;
    const txFeePercent = 2.9;
    const txFeeFlat = 0.30;

    const chartData = Array.from(weeklyData.entries())
      .map(([week, data]) => {
        const netRev = data.grossRevenue - data.discounts + data.shippingRevenue;
        const cogs = (data.grossRevenue - data.discounts) * (costPercent / 100);
        const gp = netRev - cogs;
        const fulfill = (data.orderCount * shippingCostPerOrder) + (netRev * txFeePercent / 100) + (data.orderCount * txFeeFlat);
        return {
          week,
          weekLabel: `W${week}`,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netRevenue: Math.round(netRev * 100) / 100,
          grossProfit: Math.round(gp * 100) / 100,
          cm2: Math.round((gp - fulfill) * 100) / 100,
          orderCount: data.orderCount,
          shippingRevenue: Math.round(data.shippingRevenue * 100) / 100,
          itemCount: data.itemCount,
        };
      })
      .sort((a, b) => a.week - b.week);

    const dailyChartData = Array.from(dailyData.entries())
      .map(([date, data]) => {
        const [year, month, day] = date.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const netRev = data.grossRevenue - data.discounts + data.shippingRevenue;
        const cogs = (data.grossRevenue - data.discounts) * (costPercent / 100);
        const gp = netRev - cogs;
        const fulfill = (data.orderCount * shippingCostPerOrder) + (netRev * txFeePercent / 100) + (data.orderCount * txFeeFlat);
        return {
          date,
          label: `${monthNames[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netRevenue: Math.round(netRev * 100) / 100,
          grossProfit: Math.round(gp * 100) / 100,
          cm2: Math.round((gp - fulfill) * 100) / 100,
          orderCount: data.orderCount,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const monthlyChartData = Array.from(monthlyData.entries())
      .map(([month, data]) => {
        const [year, monthNum] = month.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const netRev = data.grossRevenue - data.discounts + data.shippingRevenue;
        const cogs = (data.grossRevenue - data.discounts) * (costPercent / 100);
        const gp = netRev - cogs;
        const fulfill = (data.orderCount * shippingCostPerOrder) + (netRev * txFeePercent / 100) + (data.orderCount * txFeeFlat);
        return {
          month,
          label: monthNames[parseInt(monthNum, 10) - 1],
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netRevenue: Math.round(netRev * 100) / 100,
          grossProfit: Math.round(gp * 100) / 100,
          cm2: Math.round((gp - fulfill) * 100) / 100,
          orderCount: data.orderCount,
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    const quarterlyChartData = Array.from(quarterlyData.entries())
      .map(([quarter, data]) => {
        const netRev = data.grossRevenue - data.discounts + data.shippingRevenue;
        const cogs = (data.grossRevenue - data.discounts) * (costPercent / 100);
        const gp = netRev - cogs;
        const fulfill = (data.orderCount * shippingCostPerOrder) + (netRev * txFeePercent / 100) + (data.orderCount * txFeeFlat);
        return {
          quarter,
          label: quarter.replace('-', ' '),
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netRevenue: Math.round(netRev * 100) / 100,
          grossProfit: Math.round(gp * 100) / 100,
          cm2: Math.round((gp - fulfill) * 100) / 100,
          orderCount: data.orderCount,
        };
      })
      .sort((a, b) => a.quarter.localeCompare(b.quarter));

    const currency = allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD";
    const totalRevenue = chartData.reduce((sum, w) => sum + w.grossRevenue, 0);
    const totalDiscounts = chartData.reduce((sum, w) => sum + w.discounts, 0);
    const totalOrders = chartData.reduce((sum, w) => sum + w.orderCount, 0);

    const customerSpend: Map<string, number> = new Map();
    for (const edge of allOrders) {
      const order = edge.node;
      const customerId = order.customer?.id || "guest";
      const orderTotal = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
      customerSpend.set(customerId, (customerSpend.get(customerId) || 0) + orderTotal);
    }

    const ltvBuckets: LTVBucket[] = [
      { range: "$0-25", count: 0, min: 0, max: 25 },
      { range: "$25-50", count: 0, min: 25, max: 50 },
      { range: "$50-100", count: 0, min: 50, max: 100 },
      { range: "$100-200", count: 0, min: 100, max: 200 },
      { range: "$200-500", count: 0, min: 200, max: 500 },
      { range: "$500-1K", count: 0, min: 500, max: 1000 },
      { range: "$1K+", count: 0, min: 1000, max: Infinity },
    ];

    for (const [, spend] of customerSpend) {
      for (const bucket of ltvBuckets) {
        if (spend >= bucket.min && spend < bucket.max) { bucket.count++; break; }
      }
    }

    const ltvData = ltvBuckets.filter((b, i) => i < 4 || b.count > 0 || ltvBuckets.slice(i).some(bb => bb.count > 0));

    const customerFirstOrder: Map<string, { week: number; date: string; discount: number }> = new Map();
    for (const edge of allOrders) {
      const order = edge.node;
      const customerId = order.customer?.id || `guest-${order.id}`;
      const createdAt = new Date(order.createdAt);
      const weekNum = getWeekNumber(createdAt);
      const dateStr = createdAt.toISOString().split('T')[0];
      const discount = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      const existing = customerFirstOrder.get(customerId);
      if (!existing || dateStr < existing.date) {
        customerFirstOrder.set(customerId, { week: weekNum, date: dateStr, discount });
      }
    }

    const weeklyAcquisitionMap: Map<number, { newBuyers: number; totalDiscounts: number }> = new Map();
    for (let i = 1; i <= maxWeek; i++) weeklyAcquisitionMap.set(i, { newBuyers: 0, totalDiscounts: 0 });

    const dailyAcquisitionMap: Map<string, { newBuyers: number; totalDiscounts: number }> = new Map();

    for (const [, data] of customerFirstOrder) {
      const existingWeek = weeklyAcquisitionMap.get(data.week);
      if (existingWeek) {
        weeklyAcquisitionMap.set(data.week, {
          newBuyers: existingWeek.newBuyers + 1,
          totalDiscounts: existingWeek.totalDiscounts + data.discount,
        });
      }
      const existingDay = dailyAcquisitionMap.get(data.date) || { newBuyers: 0, totalDiscounts: 0 };
      dailyAcquisitionMap.set(data.date, {
        newBuyers: existingDay.newBuyers + 1,
        totalDiscounts: existingDay.totalDiscounts + data.discount,
      });
    }

    const acquisitionData: WeeklyAcquisition[] = Array.from(weeklyAcquisitionMap.entries())
      .map(([week, data]) => ({
        week, weekLabel: `W${week}`, newBuyers: data.newBuyers,
        avgCAC: data.newBuyers > 0 ? Math.round((data.totalDiscounts / data.newBuyers) * 100) / 100 : 0,
      }))
      .sort((a, b) => a.week - b.week);

    const dailyAcquisitionData: DailyAcquisition[] = Array.from(dailyAcquisitionMap.entries())
      .map(([date, data]) => ({
        date, dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        newBuyers: data.newBuyers,
        avgCAC: data.newBuyers > 0 ? Math.round((data.totalDiscounts / data.newBuyers) * 100) / 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top Products aggregation
    const productStats: Map<string, { productId: string; title: string; grossRevenue: number; discounts: number; orderCount: number; itemCount: number }> = new Map();
    
    for (const edge of allOrders) {
      const order = edge.node;
      const orderProductIds = new Set<string>();
      
      for (const lineItemEdge of order.lineItems?.edges || []) {
        const lineItem = lineItemEdge.node;
        const productId = lineItem.product?.id;
        const productTitle = lineItem.product?.title || "Unknown Product";
        
        if (productId) {
          const existing = productStats.get(productId) || { productId, title: productTitle, grossRevenue: 0, discounts: 0, orderCount: 0, itemCount: 0 };
          existing.grossRevenue += parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
          existing.discounts += parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
          existing.itemCount += lineItem.quantity || 0;
          
          // Only count order once per product
          if (!orderProductIds.has(productId)) {
            existing.orderCount += 1;
            orderProductIds.add(productId);
          }
          
          productStats.set(productId, existing);
        }
      }
    }
    
    const topProducts = Array.from(productStats.values())
      .map(p => {
        const netRevenue = p.grossRevenue - p.discounts;
        const aov = p.orderCount > 0 ? netRevenue / p.orderCount : 0;
        const avgDiscount = p.orderCount > 0 ? p.discounts / p.orderCount : 0;
        const grossProfitRate = netRevenue > 0 ? ((netRevenue - (netRevenue * 0.4)) / netRevenue) * 100 : 0; // Using 40% COGS assumption
        return {
          productId: p.productId,
          title: p.title,
          netRevenue: Math.round(netRevenue * 100) / 100,
          aov: Math.round(aov * 100) / 100,
          avgDiscount: Math.round(avgDiscount * 100) / 100,
          grossProfitRate: Math.round(grossProfitRate * 10) / 10,
          orderCount: p.orderCount,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    // Fetch refunds for the date range
    let totalRefunds = 0;
    let refundsHasNextPage = true;
    let refundsCursor: string | null = null;

    while (refundsHasNextPage) {
      const refundsResponse = await admin.graphql(
        `#graphql
          query getRefunds($query: String!, $cursor: String) {
            refunds: orders(first: 250, query: $query, after: $cursor) {
              edges {
                node {
                  refunds {
                    totalRefundedSet { shopMoney { amount } }
                    createdAt
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:refunded,partially_refunded`, cursor: refundsCursor } }
      );

      const refundsData = await refundsResponse.json();
      const refundOrders = refundsData.data?.refunds?.edges || [];
      
      for (const edge of refundOrders) {
        const order = edge.node;
        for (const refund of order.refunds || []) {
          // Check if refund is within date range
          const refundDate = refund.createdAt?.split('T')[0];
          if (refundDate && refundDate >= startDate && refundDate < endDateExclusive) {
            totalRefunds += parseFloat(refund.totalRefundedSet?.shopMoney?.amount || "0");
          }
        }
      }
      
      refundsHasNextPage = refundsData.data?.refunds?.pageInfo?.hasNextPage || false;
      refundsCursor = refundsData.data?.refunds?.pageInfo?.endCursor || null;
    }

    return json({
      type: "dashboard", chartData, dailyChartData, monthlyChartData, quarterlyChartData, currency,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      totalOrders, 
      totalShippingRevenue: Math.round(totalShippingRevenue * 100) / 100,
      totalItemCount,
      totalCustomers: customerSpend.size,
      acquisitionData, dailyAcquisitionData,
      channels: Array.from(channels).sort(),
      topProducts,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
    });
  }

  if (actionType === "pl") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const groupBy = (formData.get("groupBy") as string) || "month";
    
    // Make end date inclusive of full day
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id createdAt
                  totalPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount } }
                  subtotalPriceSet { shopMoney { amount } }
                  totalShippingPriceSet { shopMoney { amount } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        quantity
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive}`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    // Helper functions for period keys
    const getWeekNumber = (date: Date): number => {
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const diffInMs = date.getTime() - startOfYear.getTime();
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      return Math.floor(diffInDays / 7) + 1;
    };

    const getQuarter = (date: Date): number => Math.floor(date.getMonth() / 3) + 1;

    const getPeriodKey = (date: Date): string => {
      switch (groupBy) {
        case "day":
          return date.toISOString().split('T')[0];
        case "week":
          return `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
        case "month":
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        case "quarter":
          return `${date.getFullYear()}-Q${getQuarter(date)}`;
        case "year":
          return `${date.getFullYear()}`;
        default:
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    const getPeriodLabel = (key: string): string => {
      switch (groupBy) {
        case "day":
          return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        case "week":
          const [yearW, weekNum] = key.split('-W');
          return `Week ${parseInt(weekNum)}, ${yearW}`;
        case "month":
          const [yearM, monthM] = key.split('-');
          return new Date(parseInt(yearM), parseInt(monthM) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        case "quarter":
          const [yearQ, quarter] = key.split('-Q');
          return `Q${quarter} ${yearQ}`;
        case "year":
          return key;
        default:
          return key;
      }
    };

    const periodData: Map<string, { grossSales: number; discounts: number; shippingRevenue: number; orderCount: number; itemCount: number }> = new Map();

    for (const edge of allOrders) {
      const order = edge.node;
      const createdAt = new Date(order.createdAt);
      const periodKey = getPeriodKey(createdAt);
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
      const discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      const shippingRevenue = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      const itemCount = order.lineItems?.edges?.reduce((sum: number, e: any) => sum + (e.node.quantity || 0), 0) || 0;
      const existing = periodData.get(periodKey) || { grossSales: 0, discounts: 0, shippingRevenue: 0, orderCount: 0, itemCount: 0 };
      periodData.set(periodKey, { 
        grossSales: existing.grossSales + subtotal + discounts, 
        discounts: existing.discounts + discounts,
        shippingRevenue: existing.shippingRevenue + shippingRevenue,
        orderCount: existing.orderCount + 1,
        itemCount: existing.itemCount + itemCount,
      });
    }

    const plData: PLPeriod[] = Array.from(periodData.entries())
      .map(([period, data]) => {
        const netSales = data.grossSales - data.discounts;
        const netRevenue = netSales + data.shippingRevenue;
        return {
          period,
          periodLabel: getPeriodLabel(period),
          grossSales: Math.round(data.grossSales * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netSales: Math.round(netSales * 100) / 100,
          shippingRevenue: Math.round(data.shippingRevenue * 100) / 100,
          netRevenue: Math.round(netRevenue * 100) / 100,
          orderCount: data.orderCount,
          itemCount: data.itemCount,
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));

    // Fetch refunds for the date range
    let totalRefunds = 0;
    let refundsHasNextPage = true;
    let refundsCursor: string | null = null;

    while (refundsHasNextPage) {
      const refundsResponse = await admin.graphql(
        `#graphql
          query getRefunds($query: String!, $cursor: String) {
            refunds: orders(first: 250, query: $query, after: $cursor) {
              edges {
                node {
                  refunds {
                    totalRefundedSet { shopMoney { amount } }
                    createdAt
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:refunded,partially_refunded`, cursor: refundsCursor } }
      );

      const refundsData = await refundsResponse.json();
      const refundOrders = refundsData.data?.refunds?.edges || [];
      
      for (const edge of refundOrders) {
        const order = edge.node;
        for (const refund of order.refunds || []) {
          const refundDate = refund.createdAt?.split('T')[0];
          if (refundDate && refundDate >= startDate && refundDate < endDateExclusive) {
            totalRefunds += parseFloat(refund.totalRefundedSet?.shopMoney?.amount || "0");
          }
        }
      }
      
      refundsHasNextPage = refundsData.data?.refunds?.pageInfo?.hasNextPage || false;
      refundsCursor = refundsData.data?.refunds?.pageInfo?.endCursor || null;
    }

    return json({ type: "pl", plData, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD", totalRefunds: Math.round(totalRefunds * 100) / 100 });
  }

  if (actionType === "profitByChannel") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    
    // Make end date inclusive of full day
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  name
                  createdAt
                  channelInformation { channelDefinition { channelName } }
                  totalPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount } }
                  subtotalPriceSet { shopMoney { amount } }
                  totalShippingPriceSet { shopMoney { amount } }
                  lineItems(first: 100) {
                    edges { node { quantity } }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive}`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const channelData: Map<string, { grossSales: number; discounts: number; shippingRevenue: number; orderCount: number; itemCount: number }> = new Map();

    for (const edge of allOrders) {
      const order = edge.node;
      const channel = order.channelInformation?.channelDefinition?.channelName || "Online Store";
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
      const discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      const shippingRevenue = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      const itemCount = order.lineItems?.edges?.reduce((sum: number, e: any) => sum + (e.node.quantity || 0), 0) || 0;
      const existing = channelData.get(channel) || { grossSales: 0, discounts: 0, shippingRevenue: 0, orderCount: 0, itemCount: 0 };
      channelData.set(channel, {
        grossSales: existing.grossSales + subtotal + discounts,
        discounts: existing.discounts + discounts,
        shippingRevenue: existing.shippingRevenue + shippingRevenue,
        orderCount: existing.orderCount + 1,
        itemCount: existing.itemCount + itemCount,
      });
    }

    const channelReport = Array.from(channelData.entries())
      .map(([channel, data]) => {
        const grossRevenue = data.grossSales + data.shippingRevenue;
        return {
          channel,
          grossRevenue: Math.round(grossRevenue * 100) / 100,
          grossSales: Math.round(data.grossSales * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          netSales: Math.round((data.grossSales - data.discounts) * 100) / 100,
          shippingRevenue: Math.round(data.shippingRevenue * 100) / 100,
          netRevenue: Math.round((grossRevenue - data.discounts) * 100) / 100,
          returns: 0,
          orderCount: data.orderCount,
          itemCount: data.itemCount,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return json({ type: "profitByChannel", channelReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  if (actionType === "profitByOrder") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    
    // Make end date inclusive of full day
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  name
                  createdAt
                  channelInformation { channelDefinition { channelName } }
                  totalPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount } }
                  subtotalPriceSet { shopMoney { amount } }
                  totalShippingPriceSet { shopMoney { amount } }
                  paymentGatewayNames
                  shippingLine {
                    originalPriceSet { shopMoney { amount } }
                    discountedPriceSet { shopMoney { amount } }
                  }
                  lineItems(first: 100) {
                    edges { node { quantity } }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive}`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const orderReport = allOrders.map(edge => {
      const order = edge.node;
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
      const discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      const shippingRevenue = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      const itemCount = order.lineItems?.edges?.reduce((sum: number, e: any) => sum + (e.node.quantity || 0), 0) || 0;
      const grossSales = subtotal + discounts;
      const netSales = grossSales - discounts;
      const netRevenue = netSales + shippingRevenue;
      
      // Get payment gateway (first one if multiple)
      const paymentGateway = order.paymentGatewayNames?.[0] || "unknown";

      return {
        orderId: order.id,
        orderName: order.name,
        createdAt: order.createdAt,
        channel: order.channelInformation?.channelDefinition?.channelName || "Online Store",
        grossSales: Math.round(grossSales * 100) / 100,
        discounts: Math.round(discounts * 100) / 100,
        netSales: Math.round(netSales * 100) / 100,
        shippingRevenue: Math.round(shippingRevenue * 100) / 100,
        netRevenue: Math.round(netRevenue * 100) / 100,
        itemCount,
        paymentGateway,
        // Note: shippingLineCost (actual cost paid for Shopify labels) would require 
        // querying fulfillments API - for now this is undefined and will fall through to CSV/fallback
        shippingLineCost: undefined,
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return json({ type: "profitByOrder", orderReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  if (actionType === "profitByProduct") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const productTypeFilter = formData.get("productType") as string;
    const productTagFilter = formData.get("productTag") as string;
    
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  totalPriceSet { shopMoney { amount currencyCode } }
                  totalShippingPriceSet { shopMoney { amount } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        product { id title productType tags }
                        quantity
                        originalTotalSet { shopMoney { amount } }
                        totalDiscountSet { shopMoney { amount } }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:paid`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const productData: Map<string, { title: string; productType: string; tags: string[]; grossRevenue: number; discounts: number; orderCount: number; itemCount: number }> = new Map();
    const orderProductIds = new Map<string, Set<string>>();

    for (const edge of allOrders) {
      const order = edge.node;
      const orderId = order.id;
      
      for (const lineItemEdge of order.lineItems?.edges || []) {
        const lineItem = lineItemEdge.node;
        const productId = lineItem.product?.id;
        const productTitle = lineItem.product?.title || "Unknown Product";
        const productType = lineItem.product?.productType || "";
        const tags = lineItem.product?.tags || [];
        
        // Apply filters
        if (productTypeFilter && productTypeFilter !== "all" && productType !== productTypeFilter) continue;
        if (productTagFilter && productTagFilter !== "all" && !tags.includes(productTagFilter)) continue;
        
        if (productId) {
          const existing = productData.get(productId) || { title: productTitle, productType, tags, grossRevenue: 0, discounts: 0, orderCount: 0, itemCount: 0 };
          existing.grossRevenue += parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
          existing.discounts += parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
          existing.itemCount += lineItem.quantity || 0;
          
          // Track unique orders per product
          if (!orderProductIds.has(productId)) {
            orderProductIds.set(productId, new Set());
          }
          if (!orderProductIds.get(productId)!.has(orderId)) {
            existing.orderCount += 1;
            orderProductIds.get(productId)!.add(orderId);
          }
          
          productData.set(productId, existing);
        }
      }
    }

    // Cost settings
    const cogsPercent = 0.4;
    const shippingCostPerOrder = 5;
    const txFeePercent = 0.029;
    const txFeeFlat = 0.30;

    const productReport = Array.from(productData.entries())
      .map(([productId, data]) => {
        const netRevenue = data.grossRevenue - data.discounts;
        const cogs = netRevenue * cogsPercent;
        const grossProfit = netRevenue - cogs;
        // Fulfillment cost per product is estimated based on order count
        const fulfillmentCost = (data.orderCount * shippingCostPerOrder) + (netRevenue * txFeePercent) + (data.orderCount * txFeeFlat);
        const cm2 = grossProfit - fulfillmentCost;
        return {
          productId,
          title: data.title,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          returns: 0, // TODO: Track returns per product
          netRevenue: Math.round(netRevenue * 100) / 100,
          cogs: Math.round(cogs * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
          cm2: Math.round(cm2 * 100) / 100,
          orderCount: data.orderCount,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return json({ type: "profitByProduct", productData: productReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  if (actionType === "profitByProductType") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  totalPriceSet { shopMoney { amount currencyCode } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        product { id title productType }
                        quantity
                        originalTotalSet { shopMoney { amount } }
                        totalDiscountSet { shopMoney { amount } }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:paid`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const productTypeData: Map<string, { grossRevenue: number; discounts: number; orderCount: number; products: Set<string> }> = new Map();
    const orderTypeIds = new Map<string, Set<string>>();

    for (const edge of allOrders) {
      const order = edge.node;
      const orderId = order.id;
      
      for (const lineItemEdge of order.lineItems?.edges || []) {
        const lineItem = lineItemEdge.node;
        const productType = lineItem.product?.productType || "";
        const productId = lineItem.product?.id;
        
        const existing = productTypeData.get(productType) || { grossRevenue: 0, discounts: 0, orderCount: 0, products: new Set() };
        existing.grossRevenue += parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
        existing.discounts += parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
        if (productId) existing.products.add(productId);
        
        // Track unique orders per product type
        if (!orderTypeIds.has(productType)) {
          orderTypeIds.set(productType, new Set());
        }
        if (!orderTypeIds.get(productType)!.has(orderId)) {
          existing.orderCount += 1;
          orderTypeIds.get(productType)!.add(orderId);
        }
        
        productTypeData.set(productType, existing);
      }
    }

    const productTypeReport = Array.from(productTypeData.entries())
      .map(([productType, data]) => {
        const netRevenue = data.grossRevenue - data.discounts;
        const cogsPercent = 0.4;
        const shippingCostPerOrder = 5;
        const txFeePercent = 0.029;
        const txFeeFlat = 0.30;
        const cogs = netRevenue * cogsPercent;
        const grossProfit = netRevenue - cogs;
        const fulfillmentCost = (data.orderCount * shippingCostPerOrder) + (netRevenue * txFeePercent) + (data.orderCount * txFeeFlat);
        const cm2 = grossProfit - fulfillmentCost;
        return {
          productType,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          returns: 0,
          netRevenue: Math.round(netRevenue * 100) / 100,
          cogs: Math.round(cogs * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
          cm2: Math.round(cm2 * 100) / 100,
          orderCount: data.orderCount,
          productCount: data.products.size,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return json({ type: "profitByProductType", productTypeData: productTypeReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  if (actionType === "profitBySKU") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  totalPriceSet { shopMoney { amount currencyCode } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        sku
                        title
                        variantTitle
                        product { title }
                        quantity
                        originalTotalSet { shopMoney { amount } }
                        totalDiscountSet { shopMoney { amount } }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:paid`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const skuData: Map<string, { sku: string; title: string; grossRevenue: number; discounts: number; quantity: number }> = new Map();

    for (const edge of allOrders) {
      const order = edge.node;
      
      for (const lineItemEdge of order.lineItems?.edges || []) {
        const lineItem = lineItemEdge.node;
        const sku = lineItem.sku || "";
        const productTitle = lineItem.product?.title || lineItem.title || "Unknown";
        const variantTitle = lineItem.variantTitle ? ` - ${lineItem.variantTitle}` : "";
        const fullTitle = `${productTitle}${variantTitle}`;
        
        const existing = skuData.get(sku) || { sku, title: fullTitle, grossRevenue: 0, discounts: 0, quantity: 0 };
        existing.grossRevenue += parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
        existing.discounts += parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
        existing.quantity += lineItem.quantity || 0;
        
        skuData.set(sku, existing);
      }
    }

    const skuReport = Array.from(skuData.values())
      .map(data => {
        const netRevenue = data.grossRevenue - data.discounts;
        const cogsPercent = 0.4;
        const cogs = netRevenue * cogsPercent;
        const grossProfit = netRevenue - cogs;
        // Estimate fulfillment based on quantity
        const fulfillmentCost = data.quantity * 2; // $2 per item estimate
        const cm2 = grossProfit - fulfillmentCost;
        return {
          sku: data.sku,
          title: data.title,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          returns: 0,
          netRevenue: Math.round(netRevenue * 100) / 100,
          cogs: Math.round(cogs * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
          cm2: Math.round(cm2 * 100) / 100,
          quantity: data.quantity,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return json({ type: "profitBySKU", skuData: skuReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  if (actionType === "profitByVendor") {
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    const endDateExclusive = endDatePlusOne.toISOString().split('T')[0];

    let allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $cursor: String) {
            orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT) {
              edges {
                node {
                  id
                  totalPriceSet { shopMoney { amount currencyCode } }
                  lineItems(first: 100) {
                    edges {
                      node {
                        product { id vendor }
                        quantity
                        originalTotalSet { shopMoney { amount } }
                        totalDiscountSet { shopMoney { amount } }
                      }
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { variables: { query: `created_at:>=${startDate} AND created_at:<${endDateExclusive} AND financial_status:paid`, cursor } }
      );

      const data = await response.json();
      allOrders = [...allOrders, ...(data.data?.orders?.edges || [])];
      hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
      cursor = data.data?.orders?.pageInfo?.endCursor || null;
    }

    const vendorData: Map<string, { grossRevenue: number; discounts: number; orderCount: number; products: Set<string> }> = new Map();
    const orderVendorIds = new Map<string, Set<string>>();

    for (const edge of allOrders) {
      const order = edge.node;
      const orderId = order.id;
      
      for (const lineItemEdge of order.lineItems?.edges || []) {
        const lineItem = lineItemEdge.node;
        const vendor = lineItem.product?.vendor || "";
        const productId = lineItem.product?.id;
        
        const existing = vendorData.get(vendor) || { grossRevenue: 0, discounts: 0, orderCount: 0, products: new Set() };
        existing.grossRevenue += parseFloat(lineItem.originalTotalSet?.shopMoney?.amount || "0");
        existing.discounts += parseFloat(lineItem.totalDiscountSet?.shopMoney?.amount || "0");
        if (productId) existing.products.add(productId);
        
        if (!orderVendorIds.has(vendor)) {
          orderVendorIds.set(vendor, new Set());
        }
        if (!orderVendorIds.get(vendor)!.has(orderId)) {
          existing.orderCount += 1;
          orderVendorIds.get(vendor)!.add(orderId);
        }
        
        vendorData.set(vendor, existing);
      }
    }

    const vendorReport = Array.from(vendorData.entries())
      .map(([vendor, data]) => {
        const netRevenue = data.grossRevenue - data.discounts;
        const cogsPercent = 0.4;
        const shippingCostPerOrder = 5;
        const txFeePercent = 0.029;
        const txFeeFlat = 0.30;
        const cogs = netRevenue * cogsPercent;
        const grossProfit = netRevenue - cogs;
        const fulfillmentCost = (data.orderCount * shippingCostPerOrder) + (netRevenue * txFeePercent) + (data.orderCount * txFeeFlat);
        const cm2 = grossProfit - fulfillmentCost;
        return {
          vendor,
          grossRevenue: Math.round(data.grossRevenue * 100) / 100,
          discounts: Math.round(data.discounts * 100) / 100,
          returns: 0,
          netRevenue: Math.round(netRevenue * 100) / 100,
          cogs: Math.round(cogs * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
          cm2: Math.round(cm2 * 100) / 100,
          orderCount: data.orderCount,
          productCount: data.products.size,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return json({ type: "profitByVendor", vendorData: vendorReport, currency: allOrders[0]?.node?.totalPriceSet?.shopMoney?.currencyCode || "USD" });
  }

  return json({ error: "Unknown action type" }, { status: 400 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let allProducts: Product[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  const productTypes = new Set<string>();
  const productTags = new Set<string>();

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query getProducts($cursor: String) {
          products(first: 250, after: $cursor, sortKey: TITLE) {
            edges { node { id title productType tags } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { variables: { cursor } }
    );

    const data = await response.json();
    const products = (data.data?.products?.edges || []).map((e: any) => {
      if (e.node.productType) productTypes.add(e.node.productType);
      (e.node.tags || []).forEach((tag: string) => productTags.add(tag));
      return { id: e.node.id, title: e.node.title, productType: e.node.productType || "", tags: e.node.tags || [] };
    });
    allProducts = [...allProducts, ...products];
    hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
    cursor = data.data?.products?.pageInfo?.endCursor || null;
  }

  return json({ 
    products: allProducts, 
    productTypes: Array.from(productTypes).sort(),
    productTags: Array.from(productTags).sort()
  });
};

const formatCurrency = (value: number, currency: string) => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

const CustomTooltip = ({ active, payload, currency, metric }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = metric === "grossRevenue" ? data.grossRevenue : data.discounts;
    const label = metric === "grossRevenue" ? "Gross Revenue" : "Discounts";
    const color = metric === "grossRevenue" ? "#00d4aa" : "#d72c0d";
    return (
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #4a4a6a", borderRadius: "8px", padding: "12px 16px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>Week {data.week}</p>
        <p style={{ color, margin: "4px 0 0 0", fontSize: "18px", fontWeight: 700 }}>{formatCurrency(value, currency)}</p>
        <p style={{ color: "#8888aa", margin: "4px 0 0 0", fontSize: "12px" }}>{label} • {data.orderCount} order{data.orderCount !== 1 ? "s" : ""}</p>
      </div>
    );
  }
  return null;
};

const generateMonthOptions = () => {
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

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
};

const formatPLCurrency = (value: number, currency: string, isDiscount = false) => {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return isDiscount && value > 0 ? `(${formatted})` : formatted;
};

const EXPENSE_CATEGORIES = [
  { label: "Advertising & Marketing", value: "advertising" },
  { label: "Software & Subscriptions", value: "software" },
  { label: "Rent & Warehousing", value: "rent" },
  { label: "Payroll & Contractors", value: "payroll" },
  { label: "Professional Services", value: "professional" },
  { label: "Shipping & Fulfillment", value: "shipping" },
  { label: "Other", value: "other" },
];

const FREQUENCY_OPTIONS = [
  { label: "One-time", value: "one-time" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Annual", value: "annual" },
];

function ManageCostsTab({ 
  products, 
  selectedCostTab, 
  setSelectedCostTab, 
  expenses, 
  setExpenses,
  shippingSettings,
  setShippingSettings,
  shippingCostData,
  setShippingCostData,
  transactionFeeSettings,
  setTransactionFeeSettings,
}: { 
  products: Product[]; 
  selectedCostTab: number; 
  setSelectedCostTab: (tab: number) => void; 
  expenses: Expense[]; 
  setExpenses: (expenses: Expense[]) => void;
  shippingSettings: ShippingSettings;
  setShippingSettings: (settings: ShippingSettings) => void;
  shippingCostData: ShippingCostEntry[];
  setShippingCostData: (data: ShippingCostEntry[]) => void;
  transactionFeeSettings: TransactionFeeSettings;
  setTransactionFeeSettings: (settings: TransactionFeeSettings) => void;
}) {
  const [productCosts, setProductCosts] = useState<Map<string, number>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showAddGatewayModal, setShowAddGatewayModal] = useState(false);
  const [selectedNewGateway, setSelectedNewGateway] = useState("");
  const [expenseForm, setExpenseForm] = useState({ name: "", category: "advertising", amount: "", frequency: "monthly" as const, startDate: new Date().toISOString().split('T')[0] });
  
  // Shipping CSV local state (status and ref only - data is lifted)
  const [csvUploadStatus, setCsvUploadStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
  const shippingFileInputRef = useRef<HTMLInputElement>(null);
  
  // Simulated orders needing shipping costs (in production, this would come from actual order data)
  // These represent orders that don't have Shopify shipping labels
  const [ordersNeedingShippingCosts] = useState([
    { orderId: "#1001", orderName: "#1001", orderDate: "2025-01-15" },
    { orderId: "#1002", orderName: "#1002", orderDate: "2025-01-16" },
    { orderId: "#1003", orderName: "#1003", orderDate: "2025-01-17" },
    { orderId: "#1004", orderName: "#1004", orderDate: "2025-01-18" },
    { orderId: "#1005", orderName: "#1005", orderDate: "2025-01-19" },
    { orderId: "#1006", orderName: "#1006", orderDate: "2025-01-20" },
    { orderId: "#1007", orderName: "#1007", orderDate: "2025-01-21" },
    { orderId: "#1008", orderName: "#1008", orderDate: "2025-01-22" },
    { orderId: "#1009", orderName: "#1009", orderDate: "2025-01-23" },
    { orderId: "#1010", orderName: "#1010", orderDate: "2025-01-24" },
    { orderId: "#1011", orderName: "#1011", orderDate: "2025-01-25" },
    { orderId: "#1012", orderName: "#1012", orderDate: "2025-01-26" },
  ]);
  
  // Calculate how many orders still need shipping costs (not yet uploaded via CSV)
  const uploadedOrderIds = new Set(shippingCostData.map(e => e.orderId));
  const ordersMissingShippingCosts = ordersNeedingShippingCosts.filter(o => !uploadedOrderIds.has(o.orderId));
  const missingShippingCostCount = ordersMissingShippingCosts.length;

  // Download template function - creates CSV with orders that need shipping costs
  const handleDownloadShippingTemplate = () => {
    // Use orders that still need shipping costs for the template
    const templateData = ordersMissingShippingCosts.length > 0 
      ? ordersMissingShippingCosts.map(o => ({
          order_id: o.orderId,
          order_name: o.orderName,
          order_date: o.orderDate,
          shipping_cost: ""
        }))
      : [
          // Fallback sample data if all orders have costs
          { order_id: "#1001", order_name: "#1001", order_date: "2025-01-15", shipping_cost: "" },
        ];
    
    const headers = "order_id,order_name,order_date,shipping_cost";
    const rows = templateData.map(row => 
      `${row.order_id},${row.order_name},${row.order_date},${row.shipping_cost}`
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'shipping_costs_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Handle CSV file upload
  const handleShippingCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setCsvUploadStatus({ type: "error", message: "CSV file is empty or has no data rows" });
          return;
        }

        // Parse header
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
        const orderIdIndex = headers.findIndex(h => h === 'order_id' || h === 'orderid' || h === 'order id');
        const shippingCostIndex = headers.findIndex(h => h === 'shipping_cost' || h === 'shippingcost' || h === 'shipping cost' || h === 'cost');
        const orderNameIndex = headers.findIndex(h => h === 'order_name' || h === 'ordername' || h === 'order name' || h === 'name');

        if (orderIdIndex === -1) {
          setCsvUploadStatus({ type: "error", message: "CSV must have an 'order_id' column" });
          return;
        }
        if (shippingCostIndex === -1) {
          setCsvUploadStatus({ type: "error", message: "CSV must have a 'shipping_cost' column" });
          return;
        }

        // Parse data rows
        const newEntries: ShippingCostEntry[] = [];
        let skippedRows = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const orderId = values[orderIdIndex];
          const shippingCostStr = values[shippingCostIndex];
          const orderName = orderNameIndex !== -1 ? values[orderNameIndex] : orderId;
          
          // Skip rows with empty shipping cost
          if (!shippingCostStr || shippingCostStr === '') {
            skippedRows++;
            continue;
          }

          const shippingCost = parseFloat(shippingCostStr.replace('$', ''));
          
          if (isNaN(shippingCost)) {
            skippedRows++;
            continue;
          }

          newEntries.push({
            orderId: orderId,
            orderName: orderName || orderId,
            shippingCost: shippingCost,
            source: "csv",
            uploadedAt: new Date().toISOString(),
          });
        }

        if (newEntries.length === 0) {
          setCsvUploadStatus({ type: "error", message: "No valid shipping costs found in CSV. Make sure shipping_cost column has values." });
          return;
        }

        // Merge with existing data (update existing orders, add new ones)
        const updatedData = [...shippingCostData];
        let updatedCount = 0;
        let addedCount = 0;

        newEntries.forEach(entry => {
          const existingIndex = updatedData.findIndex(e => e.orderId === entry.orderId);
          if (existingIndex !== -1) {
            updatedData[existingIndex] = entry;
            updatedCount++;
          } else {
            updatedData.push(entry);
            addedCount++;
          }
        });

        setShippingCostData(updatedData);
        
        let message = `Successfully imported ${newEntries.length} shipping costs`;
        if (updatedCount > 0) message += ` (${updatedCount} updated, ${addedCount} new)`;
        if (skippedRows > 0) message += `. ${skippedRows} rows skipped (empty or invalid).`;
        
        setCsvUploadStatus({ type: "success", message });
        
        // Clear status after 5 seconds
        setTimeout(() => setCsvUploadStatus({ type: null, message: "" }), 5000);
        
      } catch (err) {
        setCsvUploadStatus({ type: "error", message: "Failed to parse CSV file. Please check the format." });
      }
    };
    
    reader.onerror = () => {
      setCsvUploadStatus({ type: "error", message: "Failed to read file" });
    };
    
    reader.readAsText(file);
    
    // Reset file input so same file can be uploaded again if needed
    if (shippingFileInputRef.current) {
      shippingFileInputRef.current.value = '';
    }
  };

  const productsWithCost = products.filter(p => productCosts.has(p.id)).length;
  const productAccuracy = products.length > 0 ? (productsWithCost / products.length) * 100 : 0;
  const hasExpenses = expenses.length > 0;
  
  // Shipping is complete if either: all orders have CSV costs uploaded, OR fallback estimation is configured
  const hasShippingCostsConfigured = missingShippingCostCount === 0 || shippingSettings.method !== "none";
  const hasPartialShippingData = shippingCostData.length > 0 && missingShippingCostCount > 0;
  
  const accuracyItems = [
    { label: "Product costs", complete: productAccuracy === 100, partial: productAccuracy > 0 },
    { label: "Shipping costs", complete: hasShippingCostsConfigured, partial: hasPartialShippingData },
    { label: "Transaction fees", complete: true, partial: false },
    { label: "Operating expenses", complete: hasExpenses, partial: false },
  ];
  const completedItems = accuracyItems.filter(i => i.complete).length;
  const overallAccuracy = Math.round((completedItems / accuracyItems.length) * 100);

  const filteredProducts = products.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aHasCost = productCosts.has(a.id);
    const bHasCost = productCosts.has(b.id);
    if (aHasCost === bHasCost) return a.title.localeCompare(b.title);
    return aHasCost ? 1 : -1;
  });

  const handleSaveExpense = () => {
    const newExpense: Expense = {
      id: editingExpense?.id || `exp-${Date.now()}`,
      name: expenseForm.name, category: expenseForm.category,
      amount: parseFloat(expenseForm.amount) || 0,
      frequency: expenseForm.frequency, startDate: expenseForm.startDate,
    };
    if (editingExpense) setExpenses(expenses.map(e => e.id === editingExpense.id ? newExpense : e));
    else setExpenses([...expenses, newExpense]);
    setShowExpenseModal(false);
    setEditingExpense(null);
    setExpenseForm({ name: "", category: "advertising", amount: "", frequency: "monthly", startDate: new Date().toISOString().split('T')[0] });
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({ name: expense.name, category: expense.category, amount: expense.amount.toString(), frequency: expense.frequency, startDate: expense.startDate });
    setShowExpenseModal(true);
  };

  const getMonthlyEquivalent = (expense: Expense) => {
    switch (expense.frequency) {
      case "one-time": return expense.amount;
      case "monthly": return expense.amount;
      case "quarterly": return expense.amount / 3;
      case "annual": return expense.amount / 12;
      default: return expense.amount;
    }
  };

  const totalMonthlyExpenses = expenses.reduce((sum, e) => sum + getMonthlyEquivalent(e), 0);
  const costTabs = [{ id: "products", label: "Product Costs" }, { id: "shipping", label: "Shipping" }, { id: "fees", label: "Transaction Fees" }, { id: "marketing", label: "Marketing Spend" }, { id: "expenses", label: "Operating Expenses" }];

  return (
    <Box paddingBlockStart="400">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">P&L Accuracy</Text>
                <Text as="p" tone="subdued" variant="bodySm">Complete your cost setup for more accurate profit reporting</Text>
              </BlockStack>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: overallAccuracy === 100 ? '#e3f1df' : '#fff5e6', borderRadius: '8px' }}>
                <Text as="span" variant="headingLg" fontWeight="bold">{overallAccuracy}%</Text>
                <Text as="span" tone="subdued" variant="bodySm">complete</Text>
              </div>
            </InlineStack>
            <Box paddingBlockStart="200">
              <ProgressBar progress={overallAccuracy} tone={overallAccuracy === 100 ? "success" : "highlight"} size="small" />
            </Box>
            <InlineStack gap="400" wrap>
              {accuracyItems.map((item, i) => (
                <InlineStack key={i} gap="200" blockAlign="center">
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: item.complete ? '#008060' : item.partial ? '#ffc453' : '#e1e3e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.complete && <svg width="12" height="12" viewBox="0 0 20 20" fill="white"><path d="M8.72 13.78l-3.5-3.5a.75.75 0 011.06-1.06l2.97 2.97 5.47-5.47a.75.75 0 111.06 1.06l-6 6a.75.75 0 01-1.06 0z" /></svg>}
                  </div>
                  <Text as="span" variant="bodySm" tone={item.complete ? "success" : "subdued"}>
                    {item.label}{item.label === "Product costs" && !item.complete && <span style={{ color: '#bf5000' }}> ({productsWithCost}/{products.length})</span>}
                  </Text>
                </InlineStack>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          <div style={{ borderBottom: '1px solid #e1e3e5' }}>
            <InlineStack gap="0">
              {costTabs.map((tab, index) => (
                <div key={tab.id} onClick={() => setSelectedCostTab(index)} style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: selectedCostTab === index ? '2px solid #2c6ecb' : '2px solid transparent', marginBottom: '-1px', color: selectedCostTab === index ? '#202223' : '#6b7177', fontWeight: selectedCostTab === index ? 600 : 400, fontSize: '14px' }}>
                  {tab.label}
                </div>
              ))}
            </InlineStack>
          </div>

          <Box padding="400">
            {selectedCostTab === 0 && (
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="end">
                  <Box minWidth="300px">
                    <TextField label="Search products" labelHidden placeholder="Search products..." value={searchQuery} onChange={setSearchQuery} prefix={<Icon source={SearchIcon} />} autoComplete="off" />
                  </Box>
                  <InlineStack gap="300">
                    {products.length - productsWithCost > 0 && <Badge tone="warning">{products.length - productsWithCost} missing cost</Badge>}
                    <Button variant="secondary">Update Past Orders</Button>
                  </InlineStack>
                </InlineStack>
                <div style={{ border: '1px solid #e1e3e5', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', padding: '12px 16px', backgroundColor: '#f6f6f7', borderBottom: '1px solid #e1e3e5', fontWeight: 600, fontSize: '13px', color: '#6b7177' }}>
                    <div>Product</div><div style={{ textAlign: 'right' }}>Cost</div><div style={{ textAlign: 'center' }}>Status</div>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {sortedProducts.map((product, index) => {
                      const cost = productCosts.get(product.id);
                      const hasCost = cost !== undefined;
                      return (
                        <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', padding: '12px 16px', borderBottom: index < sortedProducts.length - 1 ? '1px solid #e1e3e5' : 'none', alignItems: 'center', backgroundColor: !hasCost ? '#fffbf5' : 'white' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '16px' }}><Text as="span" variant="bodyMd">{product.title}</Text></div>
                          <div>
                            <TextField label="Cost" labelHidden type="number" prefix="$" placeholder="0.00" value={cost?.toString() || ""} onChange={(value) => {
                              const newCosts = new Map(productCosts);
                              if (value) newCosts.set(product.id, parseFloat(value));
                              else newCosts.delete(product.id);
                              setProductCosts(newCosts);
                            }} autoComplete="off" />
                          </div>
                          <div style={{ textAlign: 'center' }}>{hasCost ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Missing</Badge>}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Text as="p" tone="subdued" variant="bodySm">Tip: Product costs can also be set in Shopify Admin → Products → Edit → Cost per item</Text>
              </BlockStack>
            )}

            {selectedCostTab === 1 && (
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Shipping Costs</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Track what you pay to ship orders for accurate profit calculations</Text>
                </BlockStack>
                
                {/* Orders needing update banner */}
                {missingShippingCostCount > 0 ? (
                  <Banner tone="warning">
                    <p><strong>{missingShippingCostCount} order{missingShippingCostCount !== 1 ? 's' : ''}</strong> missing shipping costs — assuming <strong>${shippingSettings.method === "flat" ? shippingSettings.flatRate.toFixed(2) : shippingSettings.method === "per-item" ? shippingSettings.perItemRate.toFixed(2) : "0.00"}</strong> per {shippingSettings.method === "per-item" ? "item" : "order"}</p>
                  </Banner>
                ) : (
                  <Banner tone="success">
                    <p>All orders have shipping costs assigned! Your profit calculations are accurate.</p>
                  </Banner>
                )}

                {/* Shopify Shipping Labels */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{ width: '40px', height: '40px', backgroundColor: '#008060', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Text as="span" variant="bodyLg" fontWeight="bold">
                            <span style={{ color: 'white' }}>✓</span>
                          </Text>
                        </div>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">Shopify Shipping Labels</Text>
                          <Text as="span" variant="bodySm" tone="subdued">Automatically synced from your Shopify orders</Text>
                        </BlockStack>
                      </InlineStack>
                      <Badge tone="success">Active</Badge>
                    </InlineStack>
                    <Box paddingBlockStart="100" paddingInlineStart="1200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        When you purchase shipping labels through Shopify, the costs are automatically included in your profit calculations. No setup required!
                      </Text>
                    </Box>
                  </BlockStack>
                </Card>

                {/* 3rd Party Shipping - CSV Upload */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{ width: '40px', height: '40px', backgroundColor: '#f4f6f8', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e1e3e5' }}>
                          <Text as="span" variant="bodyLg">📄</Text>
                        </div>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">3rd Party Shipping (CSV Upload)</Text>
                          <Text as="span" variant="bodySm" tone="subdued">Upload shipping costs from ShipStation, Shippo, Pirate Ship, etc.</Text>
                        </BlockStack>
                      </InlineStack>
                      {shippingCostData.length > 0 && (
                        <Badge tone="success">{shippingCostData.length} orders</Badge>
                      )}
                    </InlineStack>
                    <Box paddingBlockStart="100" paddingInlineStart="1200">
                      <BlockStack gap="300">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Upload a CSV file with <code style={{ backgroundColor: '#f4f6f8', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>order_id</code> and <code style={{ backgroundColor: '#f4f6f8', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>shipping_cost</code> columns to update your orders.
                        </Text>
                        
                        {csvUploadStatus.type && (
                          <Banner
                            tone={csvUploadStatus.type === "success" ? "success" : "critical"}
                            onDismiss={() => setCsvUploadStatus({ type: null, message: "" })}
                          >
                            <p>{csvUploadStatus.message}</p>
                          </Banner>
                        )}
                        
                        <InlineStack gap="300">
                          <input
                            type="file"
                            accept=".csv"
                            ref={shippingFileInputRef}
                            onChange={handleShippingCsvUpload}
                            style={{ display: 'none' }}
                          />
                          <Button onClick={() => shippingFileInputRef.current?.click()}>Upload CSV</Button>
                          <Button variant="plain" onClick={handleDownloadShippingTemplate}>Download template</Button>
                        </InlineStack>
                        
                        {shippingCostData.length > 0 && (
                          <Box paddingBlockStart="200">
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="span" variant="bodySm" fontWeight="semibold">Uploaded Shipping Costs</Text>
                                <Button 
                                  variant="plain" 
                                  tone="critical" 
                                  onClick={() => {
                                    setShippingCostData([]);
                                    setCsvUploadStatus({ type: "success", message: "All shipping costs cleared" });
                                    setTimeout(() => setCsvUploadStatus({ type: null, message: "" }), 3000);
                                  }}
                                >
                                  Clear all
                                </Button>
                              </InlineStack>
                              <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e1e3e5', borderRadius: '8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e1e3e5', backgroundColor: '#f6f6f7' }}>
                                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Order</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Shipping Cost</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '50px' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shippingCostData.slice(0, 10).map((entry, idx) => (
                                      <tr key={entry.orderId} style={{ borderBottom: '1px solid #e1e3e5' }}>
                                        <td style={{ padding: '8px 12px' }}>{entry.orderName || entry.orderId}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>${entry.shippingCost.toFixed(2)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                          <Button
                                            variant="plain"
                                            tone="critical"
                                            size="slim"
                                            onClick={() => setShippingCostData(shippingCostData.filter(e => e.orderId !== entry.orderId))}
                                          >
                                            <Icon source={DeleteIcon} />
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {shippingCostData.length > 10 && (
                                  <div style={{ padding: '8px 12px', textAlign: 'center', backgroundColor: '#f6f6f7', borderTop: '1px solid #e1e3e5' }}>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      +{shippingCostData.length - 10} more orders
                                    </Text>
                                  </div>
                                )}
                              </div>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Total: ${shippingCostData.reduce((sum, e) => sum + e.shippingCost, 0).toFixed(2)} across {shippingCostData.length} orders
                              </Text>
                            </BlockStack>
                          </Box>
                        )}
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </Card>

                {/* Pro Plan - Integrations */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{ width: '40px', height: '40px', backgroundColor: '#f4f6f8', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e1e3e5' }}>
                          <Text as="span" variant="bodyLg">🔗</Text>
                        </div>
                        <BlockStack gap="050">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">Shipping Platform Integrations</Text>
                            <Badge tone="info">Pro</Badge>
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">Auto-sync costs from ShipStation, Shippo, EasyPost & more</Text>
                        </BlockStack>
                      </InlineStack>
                      <Badge>Coming Soon</Badge>
                    </InlineStack>
                    <Box paddingBlockStart="100" paddingInlineStart="1200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Connect your shipping platform to automatically import actual shipping costs for every order. Available on Pro plan.
                      </Text>
                    </Box>
                  </BlockStack>
                </Card>

                {/* Fallback estimation */}
                <Card background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Fallback Estimation</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      For orders without shipping data, estimate costs using one of these methods:
                    </Text>
                    <BlockStack gap="200">
                      {[
                        { method: "flat" as const, title: "Flat rate per order", desc: "Same cost for every order", field: "flatRate" },
                        { method: "per-item" as const, title: "Per item", desc: "Cost multiplied by items", field: "perItemRate" },
                      ].map(opt => (
                        <div key={opt.method} onClick={() => setShippingSettings({ ...shippingSettings, method: opt.method })} style={{ padding: '12px', border: `2px solid ${shippingSettings.method === opt.method ? '#2c6ecb' : '#e1e3e5'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: shippingSettings.method === opt.method ? '#fff' : '#f9fafb' }}>
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <Text as="span" variant="bodySm" fontWeight="semibold">{opt.title}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{opt.desc}</Text>
                            </BlockStack>
                            {shippingSettings.method === opt.method && (
                              <Box minWidth="80px">
                                <TextField label="Rate" labelHidden type="number" prefix="$" value={(shippingSettings as any)[opt.field].toString()} onChange={(value) => setShippingSettings({ ...shippingSettings, [opt.field]: parseFloat(value) || 0 })} autoComplete="off" />
                              </Box>
                            )}
                          </InlineStack>
                        </div>
                      ))}
                      <div onClick={() => setShippingSettings({ ...shippingSettings, method: "none" })} style={{ padding: '12px', border: `2px solid ${shippingSettings.method === "none" ? '#2c6ecb' : '#e1e3e5'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: shippingSettings.method === "none" ? '#fff' : '#f9fafb' }}>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodySm" fontWeight="semibold">Don't estimate</Text>
                          <Text as="span" variant="bodySm" tone="subdued">Only use actual shipping data</Text>
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            )}

            {selectedCostTab === 2 && (
              <BlockStack gap="500">
                {/* Header with title and summary side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingLg">Transaction Fees</Text>
                    <Text as="p" tone="subdued" variant="bodySm">Configure payment gateway processing fees. The app automatically calculates fees per order based on which gateway was used.</Text>
                  </BlockStack>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Fee Summary</Text>
                      <BlockStack gap="150">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm">Shopify Payments:</Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">{transactionFeeSettings.shopifyPayments.rate}% + ${transactionFeeSettings.shopifyPayments.fixedFee.toFixed(2)}</Text>
                        </InlineStack>
                        {transactionFeeSettings.paypal.enabled && (
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">PayPal:</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {transactionFeeSettings.usesShopifyPayments || transactionFeeSettings.shopifySurcharge === 0
                                ? `${transactionFeeSettings.paypal.rate}% + $${transactionFeeSettings.paypal.fixedFee.toFixed(2)}`
                                : `${(transactionFeeSettings.paypal.rate + transactionFeeSettings.shopifySurcharge).toFixed(1)}% + $${transactionFeeSettings.paypal.fixedFee.toFixed(2)}`
                              }
                            </Text>
                          </InlineStack>
                        )}
                        {transactionFeeSettings.stripe.enabled && (
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">Stripe:</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {transactionFeeSettings.shopifySurcharge === 0
                                ? `${transactionFeeSettings.stripe.rate}% + $${transactionFeeSettings.stripe.fixedFee.toFixed(2)}`
                                : `${(transactionFeeSettings.stripe.rate + transactionFeeSettings.shopifySurcharge).toFixed(1)}% + $${transactionFeeSettings.stripe.fixedFee.toFixed(2)}`
                              }
                            </Text>
                          </InlineStack>
                        )}
                        {transactionFeeSettings.additionalGateways.map((gateway) => (
                          <InlineStack key={gateway.id} align="space-between">
                            <Text as="span" variant="bodySm">{gateway.name}:</Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {transactionFeeSettings.shopifySurcharge === 0
                                ? `${gateway.rate}% + $${gateway.fixedFee.toFixed(2)}`
                                : `${(gateway.rate + transactionFeeSettings.shopifySurcharge).toFixed(1)}% + $${gateway.fixedFee.toFixed(2)}`
                              }
                            </Text>
                          </InlineStack>
                        ))}
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm" tone="subdued">Manual:</Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">$0.00</Text>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </div>
                
                {/* Shopify Plan Selection + Shopify Payments toggle on same row */}
                <Card>
                  <InlineStack gap="600" align="space-between" blockAlign="end" wrap>
                    <Box minWidth="350px">
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">Your Shopify Plan</Text>
                        <Select
                          label="Shopify Plan"
                          labelHidden
                          options={[
                            { label: "Basic Shopify (2.9% + $0.30, +2.0% third-party fee)", value: "basic" },
                            { label: "Shopify (2.6% + $0.30, +1.0% third-party fee)", value: "shopify" },
                            { label: "Advanced Shopify (2.4% + $0.30, +0.5% third-party fee)", value: "advanced" },
                            { label: "Shopify Plus (2.15% + $0.30, third-party fee waived)", value: "plus" },
                            { label: "Custom rates", value: "custom" },
                          ]}
                          value={transactionFeeSettings.quickSetup === "custom" ? "custom" : transactionFeeSettings.quickSetup.includes("basic") ? "basic" : transactionFeeSettings.quickSetup.includes("shopify") && !transactionFeeSettings.quickSetup.includes("advanced") ? "shopify" : transactionFeeSettings.quickSetup.includes("advanced") ? "advanced" : transactionFeeSettings.quickSetup.includes("plus") ? "plus" : "basic"}
                          onChange={(value) => {
                            if (value === "custom") {
                              setTransactionFeeSettings({
                                ...transactionFeeSettings,
                                quickSetup: "custom",
                              });
                            } else {
                              const shopifyRates: Record<string, { rate: number; surcharge: number }> = {
                                "basic": { rate: 2.9, surcharge: 2.0 },
                                "shopify": { rate: 2.6, surcharge: 1.0 },
                                "advanced": { rate: 2.4, surcharge: 0.5 },
                                "plus": { rate: 2.15, surcharge: 0 },
                              };
                              const rates = shopifyRates[value];
                              setTransactionFeeSettings({
                                ...transactionFeeSettings,
                                quickSetup: `us-${value}`,
                                shopifyPayments: { rate: rates.rate, fixedFee: 0.30 },
                                shopifySurcharge: rates.surcharge,
                              });
                            }
                          }}
                        />
                      </BlockStack>
                    </Box>
                    <BlockStack gap="200">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Do you use Shopify Payments?</Text>
                      <select 
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e1e3e5', fontSize: '14px', width: '100%' }}
                        value={transactionFeeSettings.usesShopifyPayments ? "yes" : "no"}
                        onChange={(e) => setTransactionFeeSettings({ ...transactionFeeSettings, usesShopifyPayments: e.target.value === "yes" })}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </BlockStack>
                  </InlineStack>
                </Card>

                {/* Shopify Payments - Only show when custom is selected */}
                {transactionFeeSettings.quickSetup === "custom" && (
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <div style={{ width: '40px', height: '40px', backgroundColor: '#008060', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text as="span" variant="bodyLg" fontWeight="bold">
                              <span style={{ color: 'white' }}>S</span>
                            </Text>
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">Shopify Payments</Text>
                            <Text as="span" variant="bodySm" tone="subdued">Credit cards, Shop Pay, Apple Pay, Google Pay</Text>
                          </BlockStack>
                        </InlineStack>
                        <Badge tone="info">Custom</Badge>
                      </InlineStack>
                      <Box paddingInlineStart="1200">
                        <InlineStack gap="400">
                          <Box minWidth="120px">
                            <TextField 
                              label="Rate (%)" 
                              type="number" 
                              value={transactionFeeSettings.shopifyPayments.rate.toString()} 
                              onChange={(value) => setTransactionFeeSettings({ 
                                ...transactionFeeSettings, 
                                shopifyPayments: { ...transactionFeeSettings.shopifyPayments, rate: parseFloat(value) || 0 } 
                              })} 
                              autoComplete="off" 
                            />
                          </Box>
                          <Box minWidth="120px">
                            <TextField 
                              label="+ Fixed ($)" 
                              type="number" 
                              value={transactionFeeSettings.shopifyPayments.fixedFee.toString()} 
                              onChange={(value) => setTransactionFeeSettings({ 
                                ...transactionFeeSettings, 
                                shopifyPayments: { ...transactionFeeSettings.shopifyPayments, fixedFee: parseFloat(value) || 0 } 
                              })} 
                              autoComplete="off" 
                            />
                          </Box>
                          <Box minWidth="120px">
                            <TextField 
                              label="3rd party fee (%)" 
                              type="number" 
                              value={transactionFeeSettings.shopifySurcharge.toString()} 
                              onChange={(value) => setTransactionFeeSettings({ 
                                ...transactionFeeSettings, 
                                shopifySurcharge: parseFloat(value) || 0 
                              })} 
                              autoComplete="off" 
                            />
                          </Box>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  </Card>
                )}

                {/* PayPal - Toggleable */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <input
                          type="checkbox"
                          checked={transactionFeeSettings.paypal.enabled}
                          onChange={(e) => setTransactionFeeSettings({
                            ...transactionFeeSettings,
                            paypal: { ...transactionFeeSettings.paypal, enabled: e.target.checked }
                          })}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <div style={{ width: '40px', height: '40px', backgroundColor: transactionFeeSettings.paypal.enabled ? '#003087' : '#e1e3e5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: transactionFeeSettings.paypal.enabled ? 1 : 0.5 }}>
                          <Text as="span" variant="bodyLg" fontWeight="bold">
                            <span style={{ color: 'white' }}>P</span>
                          </Text>
                        </div>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold" tone={transactionFeeSettings.paypal.enabled ? undefined : "subdued"}>PayPal</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {transactionFeeSettings.usesShopifyPayments 
                              ? "No extra Shopify fee (you use Shopify Payments)" 
                              : transactionFeeSettings.shopifySurcharge > 0 
                                ? `+${transactionFeeSettings.shopifySurcharge}% Shopify transaction fee applies`
                                : "No extra Shopify fee (Plus plan)"}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </InlineStack>
                    {transactionFeeSettings.paypal.enabled && (
                      <Box paddingInlineStart="1600">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">Enter your PayPal gateway rate:</Text>
                          <InlineStack gap="400">
                            <Box minWidth="120px">
                              <TextField 
                                label="Rate (%)" 
                                type="number" 
                                value={transactionFeeSettings.paypal.rate.toString()} 
                                onChange={(value) => setTransactionFeeSettings({ 
                                  ...transactionFeeSettings, 
                                  paypal: { ...transactionFeeSettings.paypal, rate: parseFloat(value) || 0 } 
                                })} 
                                autoComplete="off" 
                              />
                            </Box>
                            <Box minWidth="120px">
                              <TextField 
                                label="+ Fixed ($)" 
                                type="number" 
                                value={transactionFeeSettings.paypal.fixedFee.toString()} 
                                onChange={(value) => setTransactionFeeSettings({ 
                                  ...transactionFeeSettings, 
                                  paypal: { ...transactionFeeSettings.paypal, fixedFee: parseFloat(value) || 0 } 
                                })} 
                                autoComplete="off" 
                              />
                            </Box>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </Card>

                {/* Stripe - Toggleable */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <input
                          type="checkbox"
                          checked={transactionFeeSettings.stripe.enabled}
                          onChange={(e) => setTransactionFeeSettings({
                            ...transactionFeeSettings,
                            stripe: { ...transactionFeeSettings.stripe, enabled: e.target.checked }
                          })}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <div style={{ width: '40px', height: '40px', backgroundColor: transactionFeeSettings.stripe.enabled ? '#635bff' : '#e1e3e5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: transactionFeeSettings.stripe.enabled ? 1 : 0.5 }}>
                          <Text as="span" variant="bodyLg" fontWeight="bold">
                            <span style={{ color: 'white' }}>S</span>
                          </Text>
                        </div>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold" tone={transactionFeeSettings.stripe.enabled ? undefined : "subdued"}>Stripe</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {transactionFeeSettings.shopifySurcharge > 0 
                              ? `+${transactionFeeSettings.shopifySurcharge}% Shopify transaction fee applies` 
                              : "No extra Shopify fee (Plus plan)"}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </InlineStack>
                    {transactionFeeSettings.stripe.enabled && (
                      <Box paddingInlineStart="1600">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">Enter your Stripe gateway rate:</Text>
                          <InlineStack gap="400">
                            <Box minWidth="120px">
                              <TextField 
                                label="Rate (%)" 
                                type="number" 
                                value={transactionFeeSettings.stripe.rate.toString()} 
                                onChange={(value) => setTransactionFeeSettings({ 
                                  ...transactionFeeSettings, 
                                  stripe: { ...transactionFeeSettings.stripe, rate: parseFloat(value) || 0 } 
                                })} 
                                autoComplete="off" 
                              />
                            </Box>
                            <Box minWidth="120px">
                              <TextField 
                                label="+ Fixed ($)" 
                                type="number" 
                                value={transactionFeeSettings.stripe.fixedFee.toString()} 
                                onChange={(value) => setTransactionFeeSettings({ 
                                  ...transactionFeeSettings, 
                                  stripe: { ...transactionFeeSettings.stripe, fixedFee: parseFloat(value) || 0 } 
                                })} 
                                autoComplete="off" 
                              />
                            </Box>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </Card>

                {/* Additional Gateways */}
                {transactionFeeSettings.additionalGateways.map((gateway) => (
                  <Card key={gateway.id}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <div style={{ width: '40px', height: '40px', backgroundColor: '#f4f6f8', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e1e3e5' }}>
                            <Text as="span" variant="bodyLg">💳</Text>
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">{gateway.name}</Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {transactionFeeSettings.shopifySurcharge > 0 
                                ? `+${transactionFeeSettings.shopifySurcharge}% Shopify transaction fee applies` 
                                : "No extra Shopify fee (Plus plan)"}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button 
                          variant="plain" 
                          tone="critical"
                          onClick={() => setTransactionFeeSettings({
                            ...transactionFeeSettings,
                            additionalGateways: transactionFeeSettings.additionalGateways.filter(g => g.id !== gateway.id)
                          })}
                        >
                          Remove
                        </Button>
                      </InlineStack>
                      <Box paddingInlineStart="1200">
                        <InlineStack gap="400">
                          <Box minWidth="120px">
                            <TextField 
                              label="Rate (%)" 
                              type="number" 
                              value={gateway.rate.toString()} 
                              onChange={(value) => setTransactionFeeSettings({
                                ...transactionFeeSettings,
                                additionalGateways: transactionFeeSettings.additionalGateways.map(g => 
                                  g.id === gateway.id ? { ...g, rate: parseFloat(value) || 0 } : g
                                )
                              })} 
                              autoComplete="off" 
                            />
                          </Box>
                          <Box minWidth="120px">
                            <TextField 
                              label="+ Fixed ($)" 
                              type="number" 
                              value={gateway.fixedFee.toString()} 
                              onChange={(value) => setTransactionFeeSettings({
                                ...transactionFeeSettings,
                                additionalGateways: transactionFeeSettings.additionalGateways.map(g => 
                                  g.id === gateway.id ? { ...g, fixedFee: parseFloat(value) || 0 } : g
                                )
                              })} 
                              autoComplete="off" 
                            />
                          </Box>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  </Card>
                ))}

                {/* Add Gateway Button */}
                <Card>
                  <BlockStack gap="300">
                    {!showAddGatewayModal ? (
                      <Button onClick={() => setShowAddGatewayModal(true)} variant="secondary">+ Add another payment gateway</Button>
                    ) : (
                      <BlockStack gap="300">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">Select a payment gateway to add:</Text>
                        <Select
                          label="Gateway"
                          labelHidden
                          options={[
                            { label: "Select a gateway...", value: "" },
                            ...KNOWN_GATEWAYS
                              .filter(g => !transactionFeeSettings.additionalGateways.find(ag => ag.id === g.id))
                              .map(g => ({ label: g.name, value: g.id }))
                          ]}
                          value={selectedNewGateway}
                          onChange={setSelectedNewGateway}
                        />
                        <InlineStack gap="200">
                          <Button 
                            variant="primary"
                            disabled={!selectedNewGateway}
                            onClick={() => {
                              const gateway = KNOWN_GATEWAYS.find(g => g.id === selectedNewGateway);
                              if (gateway) {
                                setTransactionFeeSettings({
                                  ...transactionFeeSettings,
                                  additionalGateways: [
                                    ...transactionFeeSettings.additionalGateways,
                                    { id: gateway.id, name: gateway.name, apiName: gateway.apiName, rate: gateway.defaultRate, fixedFee: gateway.defaultFee }
                                  ]
                                });
                                setSelectedNewGateway("");
                                setShowAddGatewayModal(false);
                              }
                            }}
                          >
                            Add Gateway
                          </Button>
                          <Button variant="plain" onClick={() => { setShowAddGatewayModal(false); setSelectedNewGateway(""); }}>Cancel</Button>
                        </InlineStack>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              </BlockStack>
            )}

            {selectedCostTab === 3 && (
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingLg">Marketing Spend</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Connect your ad platforms to automatically import spend data for accurate profit calculations</Text>
                </BlockStack>
                
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">Ad Platform Integrations</Text>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    {[
                      { name: "Meta Ads", subtitle: "Facebook & Instagram", icon: "https://cdn.shopify.com/s/files/1/0551/3927/6830/files/meta-icon.png?v=1", connected: false },
                      { name: "Google Ads", subtitle: "Search & Display", icon: "https://cdn.shopify.com/s/files/1/0551/3927/6830/files/google-ads-icon.png?v=1", connected: false },
                      { name: "TikTok Ads", subtitle: "TikTok for Business", icon: "https://cdn.shopify.com/s/files/1/0551/3927/6830/files/tiktok-icon.png?v=1", connected: false },
                    ].map((platform) => (
                      <div key={platform.name} style={{ border: '1px solid #e1e3e5', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', backgroundColor: 'white' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', backgroundColor: '#f6f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                          {platform.name === "Meta Ads" && "📘"}
                          {platform.name === "Google Ads" && "🔍"}
                          {platform.name === "TikTok Ads" && "🎵"}
                        </div>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">{platform.name}</Text>
                          <Text as="span" variant="bodySm" tone="subdued">{platform.subtitle}</Text>
                        </BlockStack>
                        <Button size="slim" variant={platform.connected ? "secondary" : "primary"}>
                          {platform.connected ? "Connected" : "Connect"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </BlockStack>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">Manual Ad Spend Entry</Text>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">Don't use these platforms or want to add other advertising costs?</Text>
                      <Text as="p" variant="bodySm" tone="subdued">You can manually track ad spend and other marketing costs in the <strong>Operating Expenses</strong> tab under the "Advertising & Marketing" category.</Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </BlockStack>
            )}

            {selectedCostTab === 4 && (
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingLg">Operating Expenses</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Fixed and recurring business costs not tied to individual orders</Text>
                </BlockStack>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Recurring Expenses Section */}
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd">Recurring Expenses</Text>
                      <Button size="slim" onClick={() => { setEditingExpense(null); setExpenseForm({ name: "", category: "advertising", amount: "", frequency: "monthly", startDate: new Date().toISOString().split('T')[0] }); setShowExpenseModal(true); }} icon={PlusIcon}>Add recurring</Button>
                    </InlineStack>
                    
                    {/* Monthly Total - Always at top */}
                    <Card background="bg-surface-secondary">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" fontWeight="semibold">Monthly Total</Text>
                        <Text as="span" variant="headingSm" fontWeight="bold">${expenses.filter(e => e.frequency !== "one-time").reduce((sum, e) => sum + getMonthlyEquivalent(e), 0).toFixed(2)}/mo</Text>
                      </InlineStack>
                    </Card>
                    
                    {expenses.filter(e => e.frequency !== "one-time").length > 0 ? (
                      <div style={{ border: '1px solid #e1e3e5', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px', padding: '10px 12px', backgroundColor: '#f6f6f7', borderBottom: '1px solid #e1e3e5', fontWeight: 600, fontSize: '12px', color: '#6b7177' }}>
                          <div>Name</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'center' }}>Freq.</div><div style={{ textAlign: 'center' }}></div>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                          {expenses.filter(e => e.frequency !== "one-time").map((expense, index, arr) => (
                            <div key={expense.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px', padding: '10px 12px', borderBottom: index < arr.length - 1 ? '1px solid #e1e3e5' : 'none', alignItems: 'center', fontSize: '13px' }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.name}</div>
                              <div style={{ textAlign: 'right' }}>${expense.amount.toFixed(0)}</div>
                              <div style={{ textAlign: 'center' }}><Badge tone="info" size="small">{expense.frequency === 'monthly' ? 'Mo' : expense.frequency === 'quarterly' ? 'Qtr' : 'Yr'}</Badge></div>
                              <div style={{ textAlign: 'center' }}>
                                <InlineStack gap="100" align="center">
                                  <Button variant="plain" size="slim" onClick={() => handleEditExpense(expense)} icon={EditIcon} accessibilityLabel="Edit" />
                                  <Button variant="plain" size="slim" tone="critical" onClick={() => setExpenses(expenses.filter(e => e.id !== expense.id))} icon={DeleteIcon} accessibilityLabel="Delete" />
                                </InlineStack>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Card>
                        <Text as="p" tone="subdued" variant="bodySm" alignment="center">No recurring expenses added yet</Text>
                      </Card>
                    )}
                  </BlockStack>
                  
                  {/* One-time Expenses Section */}
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd">One-time Expenses</Text>
                      <Button size="slim" onClick={() => { setEditingExpense(null); setExpenseForm({ name: "", category: "advertising", amount: "", frequency: "one-time", startDate: new Date().toISOString().split('T')[0] }); setShowExpenseModal(true); }} icon={PlusIcon}>Add one-time</Button>
                    </InlineStack>
                    
                    {/* Total - Always at top */}
                    <Card background="bg-surface-secondary">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" fontWeight="semibold">Total</Text>
                        <Text as="span" variant="headingSm" fontWeight="bold">${expenses.filter(e => e.frequency === "one-time").reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</Text>
                      </InlineStack>
                    </Card>
                    
                    {expenses.filter(e => e.frequency === "one-time").length > 0 ? (
                      <div style={{ border: '1px solid #e1e3e5', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 60px', padding: '10px 12px', backgroundColor: '#f6f6f7', borderBottom: '1px solid #e1e3e5', fontWeight: 600, fontSize: '12px', color: '#6b7177' }}>
                          <div>Name</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'center' }}>Date</div><div style={{ textAlign: 'center' }}></div>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                          {expenses.filter(e => e.frequency === "one-time").map((expense, index, arr) => (
                            <div key={expense.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 60px', padding: '10px 12px', borderBottom: index < arr.length - 1 ? '1px solid #e1e3e5' : 'none', alignItems: 'center', fontSize: '13px' }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.name}</div>
                              <div style={{ textAlign: 'right' }}>${expense.amount.toFixed(0)}</div>
                              <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7177' }}>{new Date(expense.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              <div style={{ textAlign: 'center' }}>
                                <InlineStack gap="100" align="center">
                                  <Button variant="plain" size="slim" onClick={() => handleEditExpense(expense)} icon={EditIcon} accessibilityLabel="Edit" />
                                  <Button variant="plain" size="slim" tone="critical" onClick={() => setExpenses(expenses.filter(e => e.id !== expense.id))} icon={DeleteIcon} accessibilityLabel="Delete" />
                                </InlineStack>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Card>
                        <Text as="p" tone="subdued" variant="bodySm" alignment="center">No one-time expenses added yet</Text>
                      </Card>
                    )}
                  </BlockStack>
                </div>
              </BlockStack>
            )}
          </Box>
        </Card>
      </BlockStack>

      <Modal open={showExpenseModal} onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }} title={editingExpense ? "Edit Expense" : "Add Expense"}
        primaryAction={{ content: editingExpense ? "Save" : "Add", onAction: handleSaveExpense, disabled: !expenseForm.name || !expenseForm.amount }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setShowExpenseModal(false); setEditingExpense(null); } }]}>
        <Modal.Section>
          <FormLayout>
            <TextField label="Expense name" value={expenseForm.name} onChange={(value) => setExpenseForm({ ...expenseForm, name: value })} placeholder="e.g., Shopify subscription" autoComplete="off" />
            <Select label="Category" options={EXPENSE_CATEGORIES} value={expenseForm.category} onChange={(value) => setExpenseForm({ ...expenseForm, category: value })} />
            <TextField label="Amount" type="number" prefix="$" value={expenseForm.amount} onChange={(value) => setExpenseForm({ ...expenseForm, amount: value })} placeholder="0.00" autoComplete="off" />
            <Select label="Frequency" options={FREQUENCY_OPTIONS} value={expenseForm.frequency} onChange={(value) => setExpenseForm({ ...expenseForm, frequency: value as any })} />
            <TextField label="Start date" type="date" value={expenseForm.startDate} onChange={(value) => setExpenseForm({ ...expenseForm, startDate: value })} autoComplete="off" />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Box>
  );
}

function PLReport({ currency }: { currency: string }) {
  const fetcher = useFetcher<{ type: string; plData: PLPeriod[]; currency: string; totalRefunds?: number }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  
  // Cost settings - in a real implementation these would come from saved settings
  const [productCostPercent, setProductCostPercent] = useState(40); // Default: 40% of net sales as COGS
  const [shippingCostMethod, setShippingCostMethod] = useState<"flat" | "per-item">("flat");
  const [flatShippingCost, setFlatShippingCost] = useState(5);
  const [perItemShippingCost, setPerItemShippingCost] = useState(2);
  const [transactionFeePercent, setTransactionFeePercent] = useState(2.9);
  const [transactionFeeFlat, setTransactionFeeFlat] = useState(0.30);
  const [adSpend, setAdSpend] = useState(0); // TODO: Pull from ad integrations
  const [opex, setOpex] = useState(0); // TODO: Pull from expenses

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
    // Gross Revenue = top line + shipping revenue
    const grossRevenue = m.grossSales + m.shippingRevenue;
    
    // Net Revenue = Gross Revenue - Discounts - Returns
    const returnsPerPeriod = totalRefunds / (plData.length || 1); // Distribute refunds evenly
    const netRevenue = grossRevenue - m.discounts - returnsPerPeriod;
    
    // COGS
    const cogs = (m.grossSales - m.discounts) * (productCostPercent / 100);
    
    // Gross Profit (CM1) = Net Revenue - COGS
    const grossProfit = netRevenue - cogs;
    const grossProfitPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    
    // Order Fulfillment Costs
    const shippingCost = shippingCostMethod === "flat" 
      ? m.orderCount * flatShippingCost 
      : m.itemCount * perItemShippingCost;
    const transactionFees = (netRevenue * (transactionFeePercent / 100)) + (m.orderCount * transactionFeeFlat);
    const fulfillmentCost = shippingCost + transactionFees;
    
    // CM2 = Gross Profit - Fulfillment Costs
    const cm2 = grossProfit - fulfillmentCost;
    const cm2Percent = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
    
    // Ad Spend per period
    const adSpendPerPeriod = adSpend / (plData.length || 1);
    
    // CM3 = CM2 - Ad Spend
    const cm3 = cm2 - adSpendPerPeriod;
    const cm3Percent = netRevenue > 0 ? (cm3 / netRevenue) * 100 : 0;
    
    // OpEx per period
    const opexPerPeriod = opex / (plData.length || 1);
    
    // Net Profit = CM3 - OpEx
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

  // Calculate totals across all periods
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
      // Revenue Section
      { label: "Gross Revenue", values: enrichedData.map(m => formatPLCurrency(m.grossRevenue, reportCurrency)), total: formatPLCurrency(totals.grossRevenue, reportCurrency), isHeader: false, indent: 0 },
      { label: "Discounts", values: enrichedData.map(m => formatPLCurrency(m.discounts, reportCurrency, true)), total: formatPLCurrency(totals.discounts, reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Returns / Refunds", values: enrichedData.map(m => formatPLCurrency(m.returns, reportCurrency, true)), total: formatPLCurrency(totals.returns, reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Net Revenue", values: enrichedData.map(m => formatPLCurrency(m.netRevenue, reportCurrency)), total: formatPLCurrency(totals.netRevenue, reportCurrency), isHeader: true, indent: 0, highlight: true },
      
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      
      // Gross Profit Section
      { label: "COGS", values: enrichedData.map(m => formatPLCurrency(m.cogs, reportCurrency, true)), total: formatPLCurrency(totals.cogs, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "Gross Profit (CM1)", values: enrichedData.map(m => `${formatPLCurrency(m.grossProfit, reportCurrency)} (${m.grossProfitPercent}%)`), total: `${formatPLCurrency(totals.grossProfit, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.grossProfit / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      
      // CM2 Section
      { label: "Order Fulfillment Costs", values: enrichedData.map(m => formatPLCurrency(m.fulfillmentCost, reportCurrency, true)), total: formatPLCurrency(totals.fulfillmentCost, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "Shipping & Handling", values: enrichedData.map(m => formatPLCurrency(m.shippingCost, reportCurrency, true)), total: formatPLCurrency(enrichedData.reduce((sum, m) => sum + m.shippingCost, 0), reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "Transaction Fees", values: enrichedData.map(m => formatPLCurrency(m.transactionFees, reportCurrency, true)), total: formatPLCurrency(enrichedData.reduce((sum, m) => sum + m.transactionFees, 0), reportCurrency, true), isHeader: false, indent: 1, isNegative: true },
      { label: "CM2", values: enrichedData.map(m => `${formatPLCurrency(m.cm2, reportCurrency)} (${m.cm2Percent}%)`), total: `${formatPLCurrency(totals.cm2, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.cm2 / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      
      // CM3 Section
      { label: "Ad Spend", values: enrichedData.map(m => formatPLCurrency(m.adSpendPerPeriod, reportCurrency, true)), total: formatPLCurrency(totals.adSpend, reportCurrency, true), isHeader: false, indent: 0, isNegative: true },
      { label: "CM3", values: enrichedData.map(m => `${formatPLCurrency(m.cm3, reportCurrency)} (${m.cm3Percent}%)`), total: `${formatPLCurrency(totals.cm3, reportCurrency)} (${totals.netRevenue > 0 ? ((totals.cm3 / totals.netRevenue) * 100).toFixed(1) : 0}%)`, isHeader: true, indent: 0, isProfit: true },
      
      { label: "", values: enrichedData.map(() => ""), total: "", isSpacer: true },
      
      // Net Profit Section
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
            <TextField 
              label="Start Date" 
              type="date" 
              value={startDate} 
              onChange={setStartDate} 
              autoComplete="off"
            />
          </Box>
          <Box minWidth="150px">
            <TextField 
              label="End Date" 
              type="date" 
              value={endDate} 
              onChange={setEndDate} 
              autoComplete="off"
            />
          </Box>
          <Box minWidth="120px">
            <Select 
              label="Group By" 
              options={groupByOptions} 
              value={groupBy} 
              onChange={(v) => setGroupBy(v as any)} 
            />
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
                    {buildTableRows().map((row, rowIndex) => (
                      <tr key={rowIndex} style={{ 
                        borderBottom: row.isSpacer ? 'none' : '1px solid #e1e3e5', 
                        backgroundColor: row.highlight ? '#f0f7ff' : row.isHeader ? '#f6f6f7' : 'transparent',
                        height: row.isSpacer ? '12px' : 'auto',
                      }}>
                        {[row.label, ...row.values, row.total].map((cell, cellIndex, cellArr) => (
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

function ProfitByChannelReport({ currency }: { currency: string }) {
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
    grossRevenue: acc.grossRevenue + (c.grossRevenue || 0),
    discounts: acc.discounts + (c.discounts || 0),
    netRevenue: acc.netRevenue + c.netRevenue,
    cogs: acc.cogs + c.cogs,
    grossProfit: acc.grossProfit + c.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + c.fulfillmentCost,
    cm2: acc.cm2 + c.cm2,
    orderCount: acc.orderCount + c.orderCount,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0, orderCount: 0 });
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

function ProfitByPOSReport() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Profit by POS Location</Text>
        <Box padding="800">
          <BlockStack gap="400" inlineAlign="center">
            <Text as="p" variant="headingLg" alignment="center">🤔</Text>
            <Text as="p" variant="bodyLg" alignment="center" fontWeight="semibold">Do I really need this?</Text>
            <Text as="p" tone="subdued" alignment="center">This report breaks down profit by physical point-of-sale location. If you only sell online, you probably don't need it!</Text>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

function ProfitByOrderReport({ 
  currency,
  shippingSettings,
  shippingCostData,
  transactionFeeSettings,
}: { 
  currency: string;
  shippingSettings: ShippingSettings;
  shippingCostData: ShippingCostEntry[];
  transactionFeeSettings: TransactionFeeSettings;
}) {
  const fetcher = useFetcher<{ type: string; orderReport: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // COGS is still hardcoded for now (would come from product costs in future)
  const productCostPercent = 40;

  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByOrder", startDate, endDate }, { method: "POST" });
  };

  const orderData = (fetcher.data?.type === "profitByOrder" ? fetcher.data?.orderReport : []) || [];
  const reportCurrency = (fetcher.data?.type === "profitByOrder" ? fetcher.data?.currency : currency) || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  // Create multiple lookup maps for CSV shipping costs to handle format variations
  // e.g., "#1001" vs "1001" vs "#1001"
  const csvShippingCostMap = new Map<string, number>();
  shippingCostData.forEach(e => {
    // Store with original key
    csvShippingCostMap.set(e.orderId, e.shippingCost);
    // Also store normalized versions (with and without #)
    const normalized = e.orderId.replace(/^#/, '').trim();
    csvShippingCostMap.set(normalized, e.shippingCost);
    csvShippingCostMap.set(`#${normalized}`, e.shippingCost);
  });

  // Helper function to get shipping cost with cascade logic:
  // 1. Shopify shipping label (from API) → 2. CSV upload → 3. Fallback estimation
  const getShippingCost = (order: any): { cost: number; source: string } => {
    // Priority 1: Shopify shipping label cost (if available from API)
    // The API returns shippingLineCost which is what the merchant paid for Shopify labels
    if (order.shippingLineCost !== undefined && order.shippingLineCost !== null && order.shippingLineCost > 0) {
      return { cost: order.shippingLineCost, source: "shopify" };
    }
    
    // Priority 2: CSV uploaded cost - try multiple format variations
    const orderName = order.orderName || order.name || "";
    const normalizedOrderName = orderName.replace(/^#/, '').trim();
    
    // Try different formats to find a match
    const csvCost = csvShippingCostMap.get(orderName) 
      || csvShippingCostMap.get(normalizedOrderName)
      || csvShippingCostMap.get(`#${normalizedOrderName}`);
    
    if (csvCost !== undefined) {
      return { cost: csvCost, source: "csv" };
    }
    
    // Priority 3: Fallback estimation based on settings
    if (shippingSettings.method === "flat") {
      return { cost: shippingSettings.flatRate, source: "estimate" };
    } else if (shippingSettings.method === "per-item") {
      const itemCount = order.itemCount || 1;
      return { cost: shippingSettings.perItemRate * itemCount, source: "estimate" };
    }
    
    // No estimation configured
    return { cost: 0, source: "none" };
  };

  // Helper function to calculate transaction fees based on settings
  const getTransactionFees = (netRevenue: number, gateway: string | undefined): number => {
    // Determine which gateway was used and get its rates
    const gatewayLower = (gateway || "").toLowerCase();
    
    let rate = transactionFeeSettings.shopifyPayments.rate;
    let fixedFee = transactionFeeSettings.shopifyPayments.fixedFee;
    let surcharge = 0;
    
    if (gatewayLower.includes("paypal") && transactionFeeSettings.paypal.enabled) {
      rate = transactionFeeSettings.paypal.rate;
      fixedFee = transactionFeeSettings.paypal.fixedFee;
      if (!transactionFeeSettings.usesShopifyPayments) {
        surcharge = transactionFeeSettings.shopifySurcharge;
      }
    } else if (gatewayLower.includes("stripe") && transactionFeeSettings.stripe.enabled) {
      rate = transactionFeeSettings.stripe.rate;
      fixedFee = transactionFeeSettings.stripe.fixedFee;
      surcharge = transactionFeeSettings.shopifySurcharge;
    } else if (gatewayLower.includes("shopify") || gatewayLower.includes("shop_pay")) {
      // Shopify Payments - no surcharge
      rate = transactionFeeSettings.shopifyPayments.rate;
      fixedFee = transactionFeeSettings.shopifyPayments.fixedFee;
    } else {
      // Check additional gateways
      const additionalGateway = transactionFeeSettings.additionalGateways.find(
        g => gatewayLower.includes(g.apiName.toLowerCase())
      );
      if (additionalGateway) {
        rate = additionalGateway.rate;
        fixedFee = additionalGateway.fixedFee;
        surcharge = transactionFeeSettings.shopifySurcharge;
      }
    }
    
    return (netRevenue * ((rate + surcharge) / 100)) + fixedFee;
  };

  const enrichedData = orderData.map((o: any) => {
    const grossRevenue = o.grossSales + o.shippingRevenue;
    const netRevenue = grossRevenue - o.discounts;
    const cogs = netRevenue * (productCostPercent / 100);
    const grossProfit = netRevenue - cogs;
    
    // Use cascading shipping cost logic
    const { cost: shippingCost, source: shippingSource } = getShippingCost(o);
    
    // Use configured transaction fees
    const transactionFees = getTransactionFees(netRevenue, o.paymentGateway);
    
    const fulfillmentCost = shippingCost + transactionFees;
    const cm2 = grossProfit - fulfillmentCost;
    const margin = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
    
    return { ...o, grossRevenue, netRevenue, cogs, grossProfit, shippingCost, shippingSource, transactionFees, fulfillmentCost, cm2, margin };
  });

  const totals = enrichedData.reduce((acc: any, o: any) => ({
    grossRevenue: acc.grossRevenue + o.grossRevenue,
    discounts: acc.discounts + (o.discounts || 0),
    netRevenue: acc.netRevenue + o.netRevenue,
    cogs: acc.cogs + o.cogs,
    grossProfit: acc.grossProfit + o.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + o.fulfillmentCost,
    cm2: acc.cm2 + o.cm2,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0 });
  const totalMargin = totals.netRevenue > 0 ? (totals.cm2 / totals.netRevenue) * 100 : 0;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Order</Text>
          {orderData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(enrichedData.map((row: any) => ({ 
              ...row, 
              date: new Date(row.createdAt).toLocaleDateString('en-US'), 
              margin: row.margin.toFixed(1),
              shippingCostFormatted: row.shippingCost?.toFixed(2) || '0.00',
              transactionFeesFormatted: row.transactionFees?.toFixed(2) || '0.00',
            })), `profit-by-order-${startDate}-${endDate}`, [
              { key: 'orderName', label: 'Order' },
              { key: 'date', label: 'Date' },
              { key: 'grossRevenue', label: 'Gross Revenue' },
              { key: 'discounts', label: 'Discounts' },
              { key: 'returns', label: 'Returns' },
              { key: 'netRevenue', label: 'Net Revenue' },
              { key: 'cogs', label: 'COGS' },
              { key: 'grossProfit', label: 'Gross Profit' },
              { key: 'shippingCostFormatted', label: 'Shipping' },
              { key: 'shippingSource', label: 'Shipping Source' },
              { key: 'transactionFeesFormatted', label: 'Tx Fees' },
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
                    {["Order", "Date", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Shipping", "Tx Fees", "CM2", "Margin"].map((h, i) => (
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
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>
                        {formatPLCurrency(row.shippingCost || 0, reportCurrency)}
                        {row.shippingSource === 'csv' && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#008060' }}>●</span>}
                        {row.shippingSource === 'estimate' && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#bf5000' }}>○</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.transactionFees || 0, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.cm2 >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.cm2, reportCurrency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: row.margin >= 20 ? '#008060' : row.margin >= 10 ? '#202223' : '#d72c0d' }}>{row.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Box paddingBlockStart="200">
              <InlineStack gap="400">
                <InlineStack gap="100" blockAlign="center">
                  <span style={{ fontSize: '10px', color: '#008060' }}>●</span>
                  <Text as="span" variant="bodySm" tone="subdued">CSV shipping cost</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <span style={{ fontSize: '10px', color: '#bf5000' }}>○</span>
                  <Text as="span" variant="bodySm" tone="subdued">Estimated shipping cost</Text>
                </InlineStack>
              </InlineStack>
            </Box>
          </Box>
        )}
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by individual order.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && orderData.length === 0 && <Banner tone="info"><p>No orders found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}

function ProfitByProductReport({ currency, productTypes, productTags }: { currency: string; productTypes: string[]; productTags: string[] }) {
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

  // Calculate totals
  const totals = productData.reduce((acc, row) => ({
    grossRevenue: acc.grossRevenue + row.grossRevenue,
    discounts: acc.discounts + row.discounts,
    returns: acc.returns + (row.returns || 0),
    netRevenue: acc.netRevenue + row.netRevenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + (row.fulfillmentCost || 0),
    cm2: acc.cm2 + (row.cm2 || 0),
    orderCount: acc.orderCount + row.orderCount,
  }), { grossRevenue: 0, discounts: 0, returns: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0, orderCount: 0 });

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

function ProfitByProductTypeReport({ currency }: { currency: string }) {
  const fetcher = useFetcher<{ type: string; productTypeData: any[]; currency: string }>();
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const handleRunReport = () => {
    fetcher.submit({ actionType: "profitByProductType", startDate, endDate }, { method: "POST" });
  };

  const productTypeData = fetcher.data?.productTypeData || [];
  const reportCurrency = fetcher.data?.currency || currency;
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  // Calculate totals
  const totals = productTypeData.reduce((acc, row) => ({
    grossRevenue: acc.grossRevenue + row.grossRevenue,
    discounts: acc.discounts + row.discounts,
    netRevenue: acc.netRevenue + row.netRevenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + (row.fulfillmentCost || 0),
    cm2: acc.cm2 + (row.cm2 || 0),
    productCount: acc.productCount + row.productCount,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0, productCount: 0 });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">Profit by Product Type</Text>
          {productTypeData.length > 0 && (
            <Button size="slim" onClick={() => exportToCSV(productTypeData.map((row: any) => ({ ...row, productType: row.productType || '(No type)', margin: row.netRevenue > 0 ? (((row.cm2 || 0) / row.netRevenue) * 100).toFixed(1) : '0' })), `profit-by-product-type-${startDate}-${endDate}`, [
              { key: 'productType', label: 'Product Type' },
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
        <InlineStack gap="300" align="start" blockAlign="end">
          <TextField label="Start Date" type="date" value={startDate} onChange={setStartDate} autoComplete="off" />
          <TextField label="End Date" type="date" value={endDate} onChange={setEndDate} autoComplete="off" />
          <Button variant="primary" onClick={handleRunReport} loading={isLoading}>Run Report</Button>
        </InlineStack>
        
        {productTypeData.length > 0 && (
          <Box paddingBlockStart="200">
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                  <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                    {["Product Type", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Fulfill.", "CM2", "Margin"].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productTypeData.map((row: any, i: number) => {
                    const margin = row.netRevenue > 0 ? ((row.cm2 || 0) / row.netRevenue) * 100 : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e1e3e5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.productType || "(No type)"}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.grossRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.discounts, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.returns || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.fulfillmentCost || 0, reportCurrency)}</td>
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
        {fetcher.state === "idle" && !fetcher.data && <Box paddingBlockStart="200"><Text as="p" tone="subdued">Select a date range and click "Run Report" to view profit by product type.</Text></Box>}
        {fetcher.state === "idle" && fetcher.data && productTypeData.length === 0 && <Banner tone="info"><p>No product types found for the selected date range.</p></Banner>}
      </BlockStack>
    </Card>
  );
}

function ProfitBySKUReport({ currency }: { currency: string }) {
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

  const totals = skuData.reduce((acc, row) => ({
    grossRevenue: acc.grossRevenue + row.grossRevenue,
    discounts: acc.discounts + row.discounts,
    netRevenue: acc.netRevenue + row.netRevenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    fulfillmentCost: acc.fulfillmentCost + (row.fulfillmentCost || 0),
    cm2: acc.cm2 + (row.cm2 || 0),
    quantity: acc.quantity + row.quantity,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, fulfillmentCost: 0, cm2: 0, quantity: 0 });

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
                    {["SKU", "Product", "Gross Rev", "Discounts", "Returns", "Net Rev", "COGS", "Gross Profit", "Fulfill.", "CM2", "Margin"].map((h, i) => (
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
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.returns || 0, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatPLCurrency(row.netRevenue, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.cogs, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: row.grossProfit >= 0 ? '#008060' : '#d72c0d' }}>{formatPLCurrency(row.grossProfit, reportCurrency)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d72c0d' }}>{formatPLCurrency(row.fulfillmentCost || 0, reportCurrency)}</td>
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

function ProfitByVendorReport({ currency }: { currency: string }) {
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

  const totals = vendorData.reduce((acc, row) => ({
    grossRevenue: acc.grossRevenue + row.grossRevenue,
    discounts: acc.discounts + row.discounts,
    netRevenue: acc.netRevenue + row.netRevenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    orderCount: acc.orderCount + row.orderCount,
    productCount: acc.productCount + row.productCount,
  }), { grossRevenue: 0, discounts: 0, netRevenue: 0, cogs: 0, grossProfit: 0, orderCount: 0, productCount: 0 });

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

function ExpensesReport({ expenses, currency }: { expenses: Expense[]; currency: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  
  const formatPLCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, minimumFractionDigits: 2 }).format(amount);
  };

  const getMonthlyEquivalent = (expense: Expense) => {
    switch (expense.frequency) {
      case "one-time": return expense.amount;
      case "monthly": return expense.amount;
      case "quarterly": return expense.amount / 3;
      case "annual": return expense.amount / 12;
      default: return expense.amount;
    }
  };

  const EXPENSE_CATEGORIES = [
    { value: "advertising", label: "Advertising & Marketing" },
    { value: "software", label: "Software & Subscriptions" },
    { value: "rent", label: "Rent & Warehousing" },
    { value: "payroll", label: "Payroll & Contractors" },
    { value: "professional", label: "Professional Services" },
    { value: "other", label: "Other" },
  ];

  const FREQUENCY_LABELS: Record<string, string> = {
    "one-time": "One-time",
    "monthly": "Monthly",
    "quarterly": "Quarterly",
    "annual": "Annual",
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
  const monthlyBreakdown = months.map((month, index) => {
    // For now, assume all expenses apply equally each month
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
                    {expenses.map((expense, i) => (
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

interface DashboardData {
  type: string; 
  chartData: WeeklyRevenue[]; 
  dailyChartData: { date: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  monthlyChartData: { month: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  quarterlyChartData: { quarter: string; label: string; grossRevenue: number; discounts: number; orderCount: number }[];
  currency: string; totalRevenue: number; totalDiscounts: number;
  totalOrders: number; totalShippingRevenue: number; totalItemCount: number;
  totalCustomers: number;
  acquisitionData: WeeklyAcquisition[]; dailyAcquisitionData: DailyAcquisition[];
  channels: string[];
  topProducts: { productId: string; title: string; netRevenue: number; aov: number; avgDiscount: number; grossProfitRate: number; orderCount: number }[];
  totalRefunds: number;
}

export default function Index() {
  const { products, productTypes, productTags } = useLoaderData<typeof loader>();
  const dashboardFetcher = useFetcher<DashboardData>();
  const comparisonFetcher = useFetcher<DashboardData>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedReport, setSelectedReport] = useState("none");
  const [selectedCostTab, setSelectedCostTab] = useState(0);
  const [chartMetric, setChartMetric] = useState("grossRevenue");
  const [chartPeriod, setChartPeriod] = useState<"day" | "week" | "month" | "quarter">("week");
  const [showLastYear, setShowLastYear] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [selectedProductType, setSelectedProductType] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [acquisitionPeriod, setAcquisitionPeriod] = useState<"weekly" | "daily">("weekly");
  const [topProductsCount, setTopProductsCount] = useState<5 | 10 | 20>(5);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  // Lifted state for shipping settings (shared across Manage Costs and Reports)
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>({ method: "flat", flatRate: 5, perItemRate: 2 });
  const [shippingCostData, setShippingCostData] = useState<ShippingCostEntry[]>([]);
  
  // Lifted state for transaction fee settings
  const [transactionFeeSettings, setTransactionFeeSettings] = useState<TransactionFeeSettings>({ 
    quickSetup: "us-basic",
    shopifyPayments: { rate: 2.9, fixedFee: 0.30 },
    paypal: { rate: 2.99, fixedFee: 0.49, enabled: true },
    stripe: { rate: 2.9, fixedFee: 0.30, enabled: false },
    shopifySurcharge: 2.0,
    usesShopifyPayments: true,
    additionalGateways: []
  });
  
  // Date range with presets - default to Month to Date
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [datePreset, setDatePreset] = useState<"mtd" | "qtd" | "ytd" | "last30" | "last90" | "custom">("mtd");
  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  // Check if date range spans multiple years (disable YoY comparison if so)
  const startYear = parseInt(startDate.split('-')[0]);
  const endYear = parseInt(endDate.split('-')[0]);
  const isMultiYear = startYear !== endYear;

  // Calculate comparison dates (always YoY)
  const getComparisonDates = useCallback(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Same period last year
    const compStart = new Date(start);
    compStart.setFullYear(compStart.getFullYear() - 1);
    const compEnd = new Date(end);
    compEnd.setFullYear(compEnd.getFullYear() - 1);
    return { compStartDate: compStart.toISOString().split('T')[0], compEndDate: compEnd.toISOString().split('T')[0] };
  }, [startDate, endDate]);

  // Handle date preset changes
  const handlePresetChange = useCallback((preset: string) => {
    setDatePreset(preset as any);
    const now = new Date();
    let newStart: Date, newEnd: Date;
    
    switch (preset) {
      case "mtd":
        newStart = new Date(now.getFullYear(), now.getMonth(), 1);
        newEnd = now;
        break;
      case "qtd":
        const quarter = Math.floor(now.getMonth() / 3);
        newStart = new Date(now.getFullYear(), quarter * 3, 1);
        newEnd = now;
        break;
      case "ytd":
        newStart = new Date(now.getFullYear(), 0, 1);
        newEnd = now;
        break;
      case "last30":
        newStart = new Date(now);
        newStart.setDate(newStart.getDate() - 30);
        newEnd = now;
        break;
      case "last90":
        newStart = new Date(now);
        newStart.setDate(newStart.getDate() - 90);
        newEnd = now;
        break;
      default:
        return; // custom - don't change dates
    }
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
  }, []);

  // Submit dashboard request when any filter changes
  useEffect(() => {
    dashboardFetcher.submit({ 
      actionType: "dashboard", 
      productId: selectedProduct,
      productType: selectedProductType,
      channel: selectedChannel,
      startDate,
      endDate,
    }, { method: "POST" });
    
    // Also fetch comparison data for YoY (only if not multi-year)
    if (!isMultiYear) {
      const { compStartDate, compEndDate } = getComparisonDates();
      if (compStartDate && compEndDate) {
        comparisonFetcher.submit({ 
          actionType: "dashboard", 
          productId: selectedProduct,
          productType: selectedProductType,
          channel: selectedChannel,
          startDate: compStartDate,
          endDate: compEndDate,
        }, { method: "POST" });
      }
    }
  }, [selectedProduct, selectedProductType, selectedChannel, startDate, endDate, isMultiYear]);

  const handleTabChange = useCallback((selectedTabIndex: number) => setSelectedTab(selectedTabIndex), []);
  const handleMetricChange = useCallback((value: string) => setChartMetric(value), []);
  const handleProductChange = useCallback((value: string) => setSelectedProduct(value), []);
  const handleProductTypeChange = useCallback((value: string) => setSelectedProductType(value), []);
  const handleChannelChange = useCallback((value: string) => setSelectedChannel(value), []);
  const handleStartDateChange = useCallback((value: string) => { setStartDate(value); setDatePreset("custom"); }, []);
  const handleEndDateChange = useCallback((value: string) => { setEndDate(value); setDatePreset("custom"); }, []);

  const tabs = [
    { id: "home", content: "Home Dashboard", panelID: "home-panel" },
    { id: "reports", content: "Reports", panelID: "reports-panel" },
    { id: "manage-costs", content: "Cost Management", panelID: "manage-costs-panel" },
    { id: "settings", content: "Settings", panelID: "settings-panel" },
  ];

  const dashboardData = dashboardFetcher.data?.type === "dashboard" ? dashboardFetcher.data : null;
  const comparisonData = comparisonFetcher.data?.type === "dashboard" ? comparisonFetcher.data : null;
  const weeklyChartData = dashboardData?.chartData || [];
  const dailyChartData = dashboardData?.dailyChartData || [];
  const monthlyChartData = dashboardData?.monthlyChartData || [];
  const quarterlyChartData = dashboardData?.quarterlyChartData || [];
  const compWeeklyChartData = comparisonData?.chartData || [];
  const compDailyChartData = comparisonData?.dailyChartData || [];
  const compMonthlyChartData = comparisonData?.monthlyChartData || [];
  const compQuarterlyChartData = comparisonData?.quarterlyChartData || [];
  const currency = dashboardData?.currency || "USD";
  const totalRevenue = dashboardData?.totalRevenue || 0;
  const totalDiscounts = dashboardData?.totalDiscounts || 0;
  const totalOrders = dashboardData?.totalOrders || 0;
  const totalShippingRevenue = dashboardData?.totalShippingRevenue || 0;
  const totalItemCount = dashboardData?.totalItemCount || 0;
  const totalCustomers = dashboardData?.totalCustomers || 0;
  const acquisitionData = dashboardData?.acquisitionData || [];
  const dailyAcquisitionData = dashboardData?.dailyAcquisitionData || [];
  const availableChannels = dashboardData?.channels || [];
  const topProducts = dashboardData?.topProducts || [];
  const totalRefunds = dashboardData?.totalRefunds || 0;
  
  // Comparison period data
  const compRevenue = comparisonData?.totalRevenue || 0;
  const compDiscounts = comparisonData?.totalDiscounts || 0;
  const compOrders = comparisonData?.totalOrders || 0;
  const compShippingRevenue = comparisonData?.totalShippingRevenue || 0;
  const compRefunds = comparisonData?.totalRefunds || 0;
  
  // Calculate lift percentages (only if not multi-year)
  const calcLift = (current: number, previous: number) => {
    if (isMultiYear) return undefined;
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  
  // Select correct chart data based on period
  const currentChartData = chartPeriod === "day" ? dailyChartData 
    : chartPeriod === "week" ? weeklyChartData.map(d => ({ ...d, label: d.weekLabel }))
    : chartPeriod === "month" ? monthlyChartData 
    : quarterlyChartData;
  const compChartData = chartPeriod === "day" ? compDailyChartData 
    : chartPeriod === "week" ? compWeeklyChartData.map(d => ({ ...d, label: d.weekLabel }))
    : chartPeriod === "month" ? compMonthlyChartData 
    : compQuarterlyChartData;
  const isLoading = dashboardFetcher.state === "submitting" || dashboardFetcher.state === "loading";
  const hasData = totalOrders > 0;
  const currentAcquisitionData = acquisitionPeriod === "weekly" ? acquisitionData : dailyAcquisitionData;

  // Helper to get monthly equivalent for expenses
  const getMonthlyEquivalent = (expense: Expense) => {
    switch (expense.frequency) {
      case "one-time": return expense.amount;
      case "monthly": return expense.amount;
      case "quarterly": return expense.amount / 3;
      case "annual": return expense.amount / 12;
      default: return expense.amount;
    }
  };

  // Calculate prorated OpEx for the selected date range
  const totalMonthlyExpenses = expenses.reduce((sum, e) => sum + getMonthlyEquivalent(e), 0);
  const daysDiff = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const dailyOpex = totalMonthlyExpenses / 30; // Convert monthly to daily
  const proratedOpex = dailyOpex * daysDiff;

  // Calculated metrics - using default cost assumptions (can be updated from Cost Management)
  const netRevenue = totalRevenue - totalDiscounts + totalShippingRevenue;
  const productCostPercent = 40; // Default: 40% COGS
  const productCost = (totalRevenue - totalDiscounts) * (productCostPercent / 100);
  const shippingCostPerOrder = 5; // Default: $5/order
  const shippingCost = totalOrders * shippingCostPerOrder;
  const transactionFeePercent = 2.9;
  const transactionFeeFlat = 0.30;
  const transactionFees = (netRevenue * (transactionFeePercent / 100)) + (totalOrders * transactionFeeFlat);
  const fulfillmentCost = shippingCost + transactionFees;
  const grossProfit = netRevenue - productCost;
  const cm2 = grossProfit - fulfillmentCost;
  const adSpend = 0; // TODO: Pull from settings
  const cm3 = cm2 - adSpend;
  const returns = totalRefunds;
  const opex = proratedOpex;
  const grossProfitPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const cm2Percent = netRevenue > 0 ? (cm2 / netRevenue) * 100 : 0;
  const cm3Percent = netRevenue > 0 ? (cm3 / netRevenue) * 100 : 0;
  
  // Comparison period calculated metrics
  const compNetRevenue = compRevenue - compDiscounts + compShippingRevenue;
  const compProductCost = (compRevenue - compDiscounts) * (productCostPercent / 100);
  const compShippingCost = compOrders * shippingCostPerOrder;
  const compTransactionFees = (compNetRevenue * (transactionFeePercent / 100)) + (compOrders * transactionFeeFlat);
  const compFulfillmentCost = compShippingCost + compTransactionFees;
  const compGrossProfit = compNetRevenue - compProductCost;
  const compCm2 = compGrossProfit - compFulfillmentCost;
  const compAdSpend = 0;
  const compCm3 = compCm2 - compAdSpend;
  const compReturns = compRefunds;
  const compOpex = proratedOpex; // Use same opex for comparison (assumes consistent costs)

  const productOptions = [{ label: "All Products", value: "all" }, ...products.map((p: Product) => ({ label: p.title, value: p.id }))];
  const productTypeOptions = [{ label: "All Types", value: "all" }, ...productTypes.map((t: string) => ({ label: t, value: t }))];
  const channelOptions = [{ label: "All Channels", value: "all" }, ...availableChannels.map((c: string) => ({ label: c, value: c }))];
  
  const datePresetOptions = [
    { label: "Month to Date", value: "mtd" },
    { label: "Quarter to Date", value: "qtd" },
    { label: "Year to Date", value: "ytd" },
    { label: "Last 30 Days", value: "last30" },
    { label: "Last 90 Days", value: "last90" },
    { label: "Custom", value: "custom" },
  ];

  // Metric card component with tooltip and comparison
  const MetricCard = ({ label, value, tooltip, formula, lift, liftInverted = false, disabled = false }: { label: string; value: string; tooltip: string; formula?: string; lift?: number; liftInverted?: boolean; disabled?: boolean }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const liftColor = lift === undefined ? undefined : (liftInverted ? (lift > 0 ? "#d72c0d" : "#008060") : (lift > 0 ? "#008060" : "#d72c0d"));
    const liftPrefix = lift !== undefined && lift > 0 ? "+" : "";
    
    const handleMouseEnter = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setTooltipPos({ top: rect.bottom + 8, left: rect.left });
      }
      setShowTooltip(true);
    };
    
    const tooltipContent = showTooltip && typeof document !== 'undefined' ? createPortal(
      <div style={{ 
        position: 'fixed', 
        top: tooltipPos.top, 
        left: tooltipPos.left, 
        backgroundColor: '#fff', 
        color: '#202223', 
        padding: '16px', 
        borderRadius: '12px', 
        fontSize: '13px', 
        width: '280px',
        zIndex: 999999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid #e1e3e5'
      }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', borderBottom: '1px dashed #e1e3e5', paddingBottom: '8px', marginBottom: '8px' }}>{label}</p>
        {formula && <p style={{ margin: '0 0 8px 0', color: '#6b7177', fontSize: '12px' }}>{formula}</p>}
        <p style={{ margin: 0, color: '#202223', lineHeight: '1.5' }}>{tooltip}</p>
      </div>,
      document.body
    ) : null;
    
    return (
      <Box minWidth="0" width="100%">
        <Card>
          <BlockStack gap="200">
            <div 
              ref={triggerRef}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'help', opacity: disabled ? 0.5 : 1 }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <Text as="p" variant="bodyMd" tone="subdued">{label}</Text>
              <span style={{ color: '#8c9196', fontSize: '12px' }}>ⓘ</span>
            </div>
            {tooltipContent}
            <Text as="p" variant="headingLg" fontWeight="bold" tone={disabled ? "subdued" : undefined}>{value}</Text>
            {lift !== undefined && !disabled && (
              <Text as="p" variant="bodySm" fontWeight="medium">
                <span style={{ color: liftColor }}>{liftPrefix}{lift.toFixed(1)}%</span>
                <span style={{ color: '#8c9196', marginLeft: '4px' }}>vs LY</span>
              </Text>
            )}
            {disabled && (
              <Text as="p" variant="bodySm" tone="subdued">Coming soon</Text>
            )}
          </BlockStack>
        </Card>
      </Box>
    );
  };

  return (
    <Page title="Dashboard">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
        {selectedTab === 0 && (
          <Box paddingBlockStart="400">
            <BlockStack gap="500">
              <InlineStack gap="400" wrap={false} align="start">
                {/* Date Filters Section */}
                <Box minWidth="0">
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h3" variant="headingSm" tone="subdued">Date Range</Text>
                        <Text as="p" variant="bodySm" tone="subdued">(updates summary cards)</Text>
                      </InlineStack>
                      <InlineStack gap="300" align="start" blockAlign="end">
                        <Box minWidth="140px">
                          <Select label="Period" labelHidden options={datePresetOptions} value={datePreset} onChange={handlePresetChange} />
                        </Box>
                        <Box minWidth="120px">
                          <TextField 
                            label="Start" 
                            type="date" 
                            value={startDate} 
                            onChange={handleStartDateChange} 
                            autoComplete="off"
                            disabled={datePreset !== "custom"}
                          />
                        </Box>
                        <Box minWidth="120px">
                          <TextField 
                            label="End" 
                            type="date" 
                            value={endDate} 
                            onChange={handleEndDateChange} 
                            autoComplete="off"
                            disabled={datePreset !== "custom"}
                          />
                        </Box>
                      </InlineStack>
                      {isMultiYear && (
                        <Text as="p" variant="bodySm" tone="caution">YoY comparison disabled for multi-year range</Text>
                      )}
                    </BlockStack>
                  </Card>
                </Box>

                {/* Product Filters Section */}
                <Box minWidth="0">
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm" tone="subdued">Filters</Text>
                      <InlineStack gap="300" align="start" blockAlign="end">
                        <Box minWidth="180px">
                          <Select label="Product" labelHidden options={productOptions} value={selectedProduct} onChange={handleProductChange} />
                        </Box>
                        {productTypes.length > 0 && (
                          <Box minWidth="140px">
                            <Select label="Product Type" labelHidden options={productTypeOptions} value={selectedProductType} onChange={handleProductTypeChange} />
                          </Box>
                        )}
                        {availableChannels.length > 1 && (
                          <Box minWidth="140px">
                            <Select label="Channel" labelHidden options={channelOptions} value={selectedChannel} onChange={handleChannelChange} />
                          </Box>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                </Box>

                {isLoading && <Box paddingBlockStart="800"><Text as="p" tone="subdued">Loading...</Text></Box>}
              </InlineStack>

              {/* Note when product filter is active */}
              {(selectedProduct !== "all" || selectedProductType !== "all") && (
                <Banner tone="info">
                  <p>Product filter active: Ad Spend, CM3, and OpEx are hidden because these costs can't be attributed to individual products.</p>
                </Banner>
              )}

              {/* Row 1: Revenue & Profit metrics */}
              <Layout>
                <Layout.Section>
                  <InlineStack gap="300" wrap={false}>
                    <MetricCard 
                      label="Gross Revenue" 
                      value={formatCurrency(totalRevenue, currency)} 
                      formula="Product Price × Quantity"
                      tooltip="Total product sales before any discounts are applied. This is your top-line revenue."
                      lift={calcLift(totalRevenue, compRevenue)}
                    />
                    <MetricCard 
                      label="Net Revenue" 
                      value={formatCurrency(netRevenue, currency)} 
                      formula="Gross Revenue − Discounts + Shipping"
                      tooltip="Your actual collected revenue after discounts, plus what customers paid for shipping."
                      lift={calcLift(netRevenue, compNetRevenue)}
                    />
                    <MetricCard 
                      label="Gross Profit" 
                      value={`${formatCurrency(grossProfit, currency)} (${grossProfitPercent.toFixed(1)}%)`} 
                      formula="Net Revenue − COGS"
                      tooltip="Profit remaining after subtracting the cost of goods sold. A healthy gross margin is typically 50%+ for DTC brands."
                      lift={calcLift(grossProfit, compGrossProfit)}
                    />
                    <MetricCard 
                      label="CM2" 
                      value={`${formatCurrency(cm2, currency)} (${cm2Percent.toFixed(1)}%)`} 
                      formula="Gross Profit − Fulfillment Costs"
                      tooltip="Contribution Margin 2: Profit after COGS and fulfillment (shipping + transaction fees). Shows true per-order profitability."
                      lift={calcLift(cm2, compCm2)}
                    />
                    <MetricCard 
                      label="CM3" 
                      value={`${formatCurrency(cm3, currency)} (${cm3Percent.toFixed(1)}%)`} 
                      formula="CM2 − Ad Spend"
                      tooltip="Contribution Margin 3: Profit after marketing costs. This is your 'marketing contribution' - what's left to cover overhead and generate profit."
                      lift={calcLift(cm3, compCm3)}
                      disabled={selectedProduct !== "all" || selectedProductType !== "all"}
                    />
                  </InlineStack>
                </Layout.Section>
              </Layout>

              {/* Row 2: Costs & Deductions */}
              <Layout>
                <Layout.Section>
                  <InlineStack gap="300" wrap={false}>
                    <MetricCard 
                      label="Discounts" 
                      value={formatCurrency(totalDiscounts, currency)} 
                      tooltip="Total discount amount given to customers across all orders. Higher discounts can drive volume but reduce margins."
                      lift={calcLift(totalDiscounts, compDiscounts)}
                      liftInverted
                    />
                    <MetricCard 
                      label="COGS" 
                      value={formatCurrency(productCost, currency)} 
                      formula={`${productCostPercent}% of (Gross Revenue − Discounts)`}
                      tooltip="Cost of Goods Sold - what you pay suppliers for products. Currently estimated; update in Cost Management for accuracy."
                      lift={calcLift(productCost, compProductCost)}
                      liftInverted
                    />
                    <MetricCard 
                      label="Returns" 
                      value={formatCurrency(returns, currency)} 
                      tooltip="Refunds issued to customers within the selected date range."
                      lift={calcLift(returns, compReturns)}
                      liftInverted
                    />
                    <MetricCard 
                      label="Ad Spend" 
                      value={formatCurrency(adSpend, currency)} 
                      tooltip="Total marketing and advertising spend. Connect your ad accounts or enter manually in Cost Management."
                      disabled={selectedProduct !== "all" || selectedProductType !== "all" || true}
                    />
                    <MetricCard 
                      label="OpEx" 
                      value={formatCurrency(opex, currency)} 
                      formula={`${formatCurrency(totalMonthlyExpenses, currency)}/mo prorated to ${daysDiff} days`}
                      tooltip="Operating expenses prorated for the selected date range. Add expenses in Cost Management."
                      lift={calcLift(opex, compOpex)}
                      liftInverted
                      disabled={selectedProduct !== "all" || selectedProductType !== "all"}
                    />
                  </InlineStack>
                </Layout.Section>
              </Layout>

              <Layout>
                <Layout.Section>
                  <Card background="bg-surface-secondary">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          <strong>Cost Assumptions:</strong> COGS = {productCostPercent}% of product sales • Shipping = ${shippingCostPerOrder}/order • Transaction fees = {transactionFeePercent}% + ${transactionFeeFlat}/order
                        </Text>
                      </BlockStack>
                      <Button variant="plain" onClick={() => { setSelectedTab(2); }}>Update in Cost Management →</Button>
                    </InlineStack>
                  </Card>
                </Layout.Section>
              </Layout>

              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h2" variant="headingMd">Metric Trends</Text>
                        <InlineStack gap="300" blockAlign="center">
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7177', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showLastYear} onChange={(e) => setShowLastYear(e.target.checked)} style={{ cursor: 'pointer' }} />
                            Show Last Year
                          </label>
                          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f6f6f7', borderRadius: '8px', padding: '4px' }}>
                            {(["day", "week", "month", "quarter"] as const).map(period => (
                              <button key={period} onClick={() => setChartPeriod(period)} style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 500, border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: chartPeriod === period ? '#fff' : 'transparent', color: chartPeriod === period ? '#202223' : '#6b7177', boxShadow: chartPeriod === period ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                                {period.charAt(0).toUpperCase() + period.slice(1)}
                              </button>
                            ))}
                          </div>
                          <Select 
                            label="Metric" 
                            labelHidden 
                            options={[
                              { label: "Gross Revenue", value: "grossRevenue" }, 
                              { label: "Discounts", value: "discounts" },
                              { label: "Net Revenue", value: "netRevenue" },
                              { label: "Gross Profit", value: "grossProfit" },
                              { label: "CM2", value: "cm2" },
                            ]} 
                            value={chartMetric} 
                            onChange={handleMetricChange} 
                          />
                        </InlineStack>
                      </InlineStack>
                      {isLoading ? <Box paddingBlockStart="400" paddingBlockEnd="400"><Text as="p" tone="subdued">Loading chart data...</Text></Box>
                       : !hasData ? <Box paddingBlockStart="400" paddingBlockEnd="400"><Banner tone="info"><p>No paid orders found yet.</p></Banner></Box>
                       : (
                        <Box paddingBlockStart="400" minHeight="400px">
                          <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={currentChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7177" }} tickLine={false} axisLine={{ stroke: "#e0e0e0" }} angle={-45} textAnchor="end" height={60} interval={currentChartData.length > 20 ? Math.floor(currentChartData.length / 15) : 0} />
                              <YAxis tick={{ fontSize: 11, fill: "#6b7177" }} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value, currency)} width={80} />
                              <RechartsTooltip content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const metricLabels: Record<string, string> = { grossRevenue: "Gross Revenue", discounts: "Discounts", netRevenue: "Net Revenue", grossProfit: "Gross Profit", cm2: "CM2" };
                                  const metricColors: Record<string, string> = { grossRevenue: "#008060", discounts: "#d72c0d", netRevenue: "#2c6ecb", grossProfit: "#8884d8", cm2: "#ffc658" };
                                  const value = data[chartMetric] ?? 0;
                                  const label = metricLabels[chartMetric] || chartMetric;
                                  const color = metricColors[chartMetric] || "#008060";
                                  return (
                                    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #4a4a6a", borderRadius: "8px", padding: "12px 16px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
                                      <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>{data.label}</p>
                                      <p style={{ color, margin: "4px 0 0 0", fontSize: "18px", fontWeight: 700 }}>{formatCurrency(value, currency)}</p>
                                      <p style={{ color: "#8888aa", margin: "4px 0 0 0", fontSize: "12px" }}>{label} • {data.orderCount} order{data.orderCount !== 1 ? "s" : ""}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }} />
                              <Line type="monotone" dataKey={chartMetric} stroke={({ grossRevenue: "#008060", discounts: "#d72c0d", netRevenue: "#2c6ecb", grossProfit: "#8884d8", cm2: "#ffc658" } as Record<string, string>)[chartMetric] || "#008060"} strokeWidth={2} dot={{ fill: ({ grossRevenue: "#008060", discounts: "#d72c0d", netRevenue: "#2c6ecb", grossProfit: "#8884d8", cm2: "#ffc658" } as Record<string, string>)[chartMetric] || "#008060", strokeWidth: 0, r: 3 }} activeDot={{ r: 6, fill: ({ grossRevenue: "#008060", discounts: "#d72c0d", netRevenue: "#2c6ecb", grossProfit: "#8884d8", cm2: "#ffc658" } as Record<string, string>)[chartMetric] || "#008060" }} name="Current" />
                              {showLastYear && compChartData.length > 0 && (
                                <Line type="monotone" dataKey={chartMetric} data={compChartData} stroke="#aaa" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Last Year" />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                          {showLastYear && <Text as="p" variant="bodySm" tone="subdued" alignment="center">Solid line = Current period • Dashed line = Same period last year</Text>}
                        </Box>
                      )}
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>

              {/* Top Products Table */}
              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h2" variant="headingMd">Top Products</Text>
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f6f6f7', borderRadius: '8px', padding: '4px' }}>
                          {([5, 10, 20] as const).map(count => (
                            <button key={count} onClick={() => setTopProductsCount(count)} style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 500, border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: topProductsCount === count ? '#fff' : 'transparent', color: topProductsCount === count ? '#202223' : '#6b7177', boxShadow: topProductsCount === count ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                              Top {count}
                            </button>
                          ))}
                        </div>
                      </InlineStack>
                      {isLoading ? <Box paddingBlockStart="400" paddingBlockEnd="400"><Text as="p" tone="subdued">Loading products...</Text></Box>
                       : topProducts.length === 0 ? <Box paddingBlockStart="400" paddingBlockEnd="400"><Banner tone="info"><p>No product data available yet.</p></Banner></Box>
                       : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid #e1e3e5' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#202223' }}>Product</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#202223' }}>Net Revenue</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#202223' }}>AOV</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#202223' }}>Avg Discount</th>
                                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#202223' }}>Gross Profit %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topProducts.slice(0, topProductsCount).map((product, i) => (
                                <tr key={product.productId} style={{ borderBottom: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '10px 12px', fontWeight: 500, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.title}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(product.netRevenue, currency)}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(product.aov, currency)}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(product.avgDiscount, currency)}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: product.grossProfitRate >= 50 ? '#008060' : product.grossProfitRate >= 30 ? '#202223' : '#d72c0d' }}>{product.grossProfitRate.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>
            </BlockStack>
          </Box>
        )}

        {selectedTab === 1 && (
          <Box paddingBlockStart="400">
            {selectedReport === "none" ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Order sales profit</Text>
                    <BlockStack gap="200">
                      {[
                        { label: "P&L Report", key: "pl" },
                        { label: "Profit by channel", key: "profitByChannel" },
                        { label: "Profit by POS location", key: "profitByPOS" },
                        { label: "Profit by order", key: "profitByOrder" },
                      ].map(item => (
                        <div key={item.key} onClick={() => setSelectedReport(item.key)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                          <Text as="p" variant="bodyMd"><span style={{ color: '#2c6ecb' }}>{item.label}</span></Text>
                        </div>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Product sales profit</Text>
                    <BlockStack gap="200">
                      {[
                        { label: "Profit by product", key: "profitByProduct" },
                        { label: "Profit by product type", key: "profitByProductType" },
                        { label: "Profit by SKU", key: "profitBySKU" },
                        { label: "Profit by vendor", key: "profitByVendor" },
                      ].map(item => (
                        <div key={item.key} onClick={() => setSelectedReport(item.key)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                          <Text as="p" variant="bodyMd"><span style={{ color: '#2c6ecb' }}>{item.label}</span></Text>
                        </div>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Expenses</Text>
                    <BlockStack gap="200">
                      <div onClick={() => setSelectedReport("expensesReport")} style={{ cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                        <Text as="p" variant="bodyMd"><span style={{ color: '#2c6ecb' }}>Expenses report</span></Text>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </div>
            ) : (
              <BlockStack gap="400">
                <Button variant="plain" onClick={() => setSelectedReport("none")} icon={<svg viewBox="0 0 20 20" width="20" height="20"><path d="M17 9H5.414l3.293-3.293a1 1 0 10-1.414-1.414l-5 5a1 1 0 000 1.414l5 5a1 1 0 001.414-1.414L5.414 11H17a1 1 0 100-2z" fill="currentColor"/></svg>}>Back to Reports</Button>
                {selectedReport === "pl" && <PLReport currency={currency} />}
                {selectedReport === "profitByChannel" && <ProfitByChannelReport currency={currency} />}
                {selectedReport === "profitByPOS" && <ProfitByPOSReport />}
                {selectedReport === "profitByOrder" && <ProfitByOrderReport 
                  currency={currency} 
                  shippingSettings={shippingSettings}
                  shippingCostData={shippingCostData}
                  transactionFeeSettings={transactionFeeSettings}
                />}
                {selectedReport === "profitByProduct" && <ProfitByProductReport currency={currency} productTypes={productTypes} productTags={productTags} />}
                {selectedReport === "profitByProductType" && <ProfitByProductTypeReport currency={currency} />}
                {selectedReport === "profitBySKU" && <ProfitBySKUReport currency={currency} />}
                {selectedReport === "profitByVendor" && <ProfitByVendorReport currency={currency} />}
                {selectedReport === "expensesReport" && <ExpensesReport expenses={expenses} currency={currency} />}
              </BlockStack>
            )}
          </Box>
        )}

        {selectedTab === 2 && (
          <ManageCostsTab 
            products={products} 
            selectedCostTab={selectedCostTab} 
            setSelectedCostTab={setSelectedCostTab} 
            expenses={expenses} 
            setExpenses={setExpenses}
            shippingSettings={shippingSettings}
            setShippingSettings={setShippingSettings}
            shippingCostData={shippingCostData}
            setShippingCostData={setShippingCostData}
            transactionFeeSettings={transactionFeeSettings}
            setTransactionFeeSettings={setTransactionFeeSettings}
          />
        )}

        {selectedTab === 3 && (
          <Box paddingBlockStart="400">
            <BlockStack gap="500">
              {/* Store Information */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Store Information</Text>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Store Name</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">My Shopify Store</Text>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Plan</Text>
                      <Badge tone="success">Pro</Badge>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Connected Since</Text>
                      <Text as="p" variant="bodyMd">December 15, 2024</Text>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Data Sync Status</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#008060' }}></span>
                        <Text as="p" variant="bodyMd">Synced</Text>
                      </InlineStack>
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>

              {/* Connected Stores */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Connected Stores</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Manage your Shopify store connections</Text>
                    </BlockStack>
                    <Button variant="primary" icon={PlusIcon}>Add Store</Button>
                  </InlineStack>
                  <div style={{ border: '1px solid #e1e3e5', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 120px 100px', padding: '12px 16px', backgroundColor: '#f6f6f7', borderBottom: '1px solid #e1e3e5', fontWeight: 600, fontSize: '13px', color: '#6b7177' }}>
                      <div>Store</div>
                      <div>Status</div>
                      <div>Last Sync</div>
                      <div style={{ textAlign: 'center' }}>Actions</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 120px 100px', padding: '12px 16px', alignItems: 'center' }}>
                      <div>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">my-store.myshopify.com</Text>
                      </div>
                      <div>
                        <Badge tone="success">Connected</Badge>
                      </div>
                      <div>
                        <Text as="span" variant="bodySm" tone="subdued">2 min ago</Text>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <Button variant="plain" tone="critical">Disconnect</Button>
                      </div>
                    </div>
                  </div>
                </BlockStack>
              </Card>

              {/* Ad Integrations */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Ad Platform Integrations</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Connect your ad accounts to automatically import spend data</Text>
                  </BlockStack>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    {/* Meta/Facebook */}
                    <div style={{ border: '1px solid #e1e3e5', borderRadius: '12px', padding: '20px' }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>f</span>
                          </div>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">Meta Ads</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Facebook & Instagram</Text>
                          </BlockStack>
                        </InlineStack>
                        <Button fullWidth>Connect</Button>
                      </BlockStack>
                    </div>

                    {/* Google Ads */}
                    <div style={{ border: '1px solid #e1e3e5', borderRadius: '12px', padding: '20px' }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: '#4285f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>G</span>
                          </div>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">Google Ads</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Search & Display</Text>
                          </BlockStack>
                        </InlineStack>
                        <Button fullWidth>Connect</Button>
                      </BlockStack>
                    </div>

                    {/* TikTok */}
                    <div style={{ border: '1px solid #e1e3e5', borderRadius: '12px', padding: '20px' }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>TT</span>
                          </div>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">TikTok Ads</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Video ads</Text>
                          </BlockStack>
                        </InlineStack>
                        <Button fullWidth>Connect</Button>
                      </BlockStack>
                    </div>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </Box>
        )}
      </Tabs>
    </Page>
  );
}