import type { CustomerRecord } from '../types';
import { cleanLabel, formatINR } from './formatters';

export type AxisKey =
  | 'total_visits'
  | 'avg_spend_per_visit_inr'
  | 'total_spend_inr'
  | 'avg_group_size'
  | 'days_since_last_visit'
  | 'expected_visit_gap'
  | 'discount_pct'
  | 'avg_rating_given';

export const AXIS_OPTIONS: Array<{ key: AxisKey; label: string; shortLabel: string }> = [
  { key: 'total_visits', label: 'Total Visits', shortLabel: 'Visits' },
  { key: 'avg_spend_per_visit_inr', label: 'Avg Spend/Visit', shortLabel: 'Avg/Visit (₹)' },
  { key: 'total_spend_inr', label: 'Total Spend', shortLabel: 'Total Spend (₹)' },
  { key: 'days_since_last_visit', label: 'Days Since Visit', shortLabel: 'Days Since Visit' },
  { key: 'expected_visit_gap', label: 'Visit Interval', shortLabel: 'Visit Interval (d)' },
  { key: 'avg_group_size', label: 'Party Size', shortLabel: 'Party Size' },
];

export function getAxisValue(c: CustomerRecord, key: AxisKey): number | null {
  switch (key) {
    case 'total_visits':
      return Number.isFinite(Number(c.total_visits)) ? Number(c.total_visits) : 0;
    case 'avg_spend_per_visit_inr':
      return Number.isFinite(Number(c.avg_spend_per_visit_inr))
        ? Number(c.avg_spend_per_visit_inr)
        : 0;
    case 'total_spend_inr':
      return Number.isFinite(Number(c.total_spend_inr)) ? Number(c.total_spend_inr) : 0;
    case 'avg_group_size':
      return Number.isFinite(Number(c.avg_group_size)) ? Number(c.avg_group_size) : 1;
    case 'days_since_last_visit':
      return Number.isFinite(Number(c.days_since_last_visit))
        ? Number(c.days_since_last_visit)
        : 0;
    case 'expected_visit_gap':
      return Number.isFinite(Number(c.expected_visit_gap))
        ? Number(c.expected_visit_gap)
        : 0;
    case 'discount_pct':
    case 'avg_rating_given':
      return null;
  }
}

export function formatAxisValue(val: number | null, key: AxisKey): string {
  if (val === null || !Number.isFinite(val)) return 'N/A';
  if (key === 'avg_spend_per_visit_inr' || key === 'total_spend_inr') {
    return formatINR(val);
  }
  if (key === 'days_since_last_visit' || key === 'expected_visit_gap') {
    return `${Math.round(val)}d`;
  }
  if (key === 'avg_group_size') {
    return `${Number(val.toFixed(1))}`;
  }
  return `${Math.round(val)}`;
}

export const CLUSTER_COLORS: Record<
  number,
  { main: string; soft: string; border: string; label: string }
> = {
  0: {
    main: '#ab6446',
    soft: 'rgba(171, 100, 70, 0.11)',
    border: 'rgba(171, 100, 70, 0.34)',
    label: 'Frequent Visitors',
  },
  1: {
    main: '#0284c7',
    soft: 'rgba(2, 132, 199, 0.11)',
    border: 'rgba(2, 132, 199, 0.34)',
    label: 'Premium Customers',
  },
  2: {
    main: '#d97706',
    soft: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.35)',
    label: 'Family Visitors',
  },
  3: {
    main: '#0d9488',
    soft: 'rgba(13, 148, 136, 0.11)',
    border: 'rgba(13, 148, 136, 0.34)',
    label: 'Occasional Customers',
  },
};

export function buildPlainEnglishReason(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): string {
  const pool = allCustomers.length > 0 ? allCustomers : [customer];
  const avgVisits =
    pool.reduce((s, c) => s + (Number(c.total_visits) || 1), 0) / Math.max(1, pool.length);
  const avgBill =
    pool.reduce((s, c) => s + (Number(c.avg_spend_per_visit_inr) || 0), 0) /
    Math.max(1, pool.length);

  const visitMult = customer.total_visits / Math.max(1, avgVisits);
  const spendMult = customer.avg_spend_per_visit_inr / Math.max(1, avgBill);

  if (customer.cluster_id === 3) {
    return `Visited once (${customer.days_since_last_visit}d ago) with ${formatINR(
      customer.total_spend_inr
    )} order via ${cleanLabel(customer.preferred_order_channel)} — grouped as an Occasional Customer ready for a second visit.`;
  }

  if (customer.cluster_id === 1) {
    return spendMult >= 1.25
      ? `Spends ${spendMult.toFixed(1)}× the restaurant average per visit (${formatINR(
          customer.avg_spend_per_visit_inr
        )}) with strong preference for ${customer.top_food_category}.`
      : `Maintains premium dining spend (${formatINR(
          customer.total_spend_inr
        )} total) with high-value orders.`;
  }

  if (customer.cluster_id === 2) {
    return `Dines in larger groups (party of ${
      customer.avg_group_size
    }) mostly on ${customer.preferred_day_type.toLowerCase()}s, spending ${formatINR(
      customer.avg_spend_per_visit_inr
    )} per visit.`;
  }

  return visitMult >= 1.15
    ? `Visits ${visitMult.toFixed(1)}× more than average (${
        customer.total_visits
      } times, every ~${customer.expected_visit_gap}d) with ${formatINR(
        customer.avg_spend_per_visit_inr
      )} avg/visit.`
    : `Repeat guest with ${customer.total_visits} visits (every ~${
        customer.expected_visit_gap
      }d) and ${formatINR(customer.avg_spend_per_visit_inr)} average spend per visit.`;
}

export function buildStaffHospitalityTip(customer: CustomerRecord): string {
  const dish =
    customer.most_ordered_dish && customer.most_ordered_dish.trim()
      ? customer.most_ordered_dish.trim()
      : customer.top_food_category || "Chef's Specials";
  const meal = cleanLabel(customer.preferred_meal_time || 'Dinner');
  const day = customer.preferred_day_type || 'Weekend';

  if (customer.cluster_id === 3) {
    return `Single-visit guest (${customer.days_since_last_visit}d ago)—send a warm second-visit invitation highlighting their first-visit choice (${dish}) to build repeat loyalty.`;
  }

  if (customer.cluster_id === 1) {
    return `Offer priority ${day.toLowerCase()} ${meal.toLowerCase()} seating and have staff personally check on their ${dish} experience.`;
  }

  if (customer.cluster_id === 2) {
    return `Prepare a comfortable ${customer.avg_group_size}-seat family table for ${day.toLowerCase()} ${meal.toLowerCase()} and suggest sharing platters alongside ${dish}.`;
  }

  return customer.days_since_last_visit >= 35
    ? `Guest hasn't visited in ${customer.days_since_last_visit} days—welcome them back warmly with a quick reminder of their favourite ${dish}.`
    : `Recognize them as a valued regular (${customer.total_visits} visits) and suggest pairing ${dish} with a signature dessert or beverage.`;
}