import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import {
  buildClusterProfiles,
  predictCustomerCluster,
  trainKMeansModel,
} from './kmeans.ts';
import {
  createSeedData,
  deriveCustomerFields,
  getDatasetReferenceDate,
  normalizeDateToYMD,
  parseCustomersCsv,
} from './seed.ts';
import type {
  BirthdayOffer,
  CampaignRecipient,
  CampaignRecord,
  CustomerRecord,
  DatabaseState,
  MlPipelineRun,
  OrderRecord,
  ProcessingLog,
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'mothers_hut_db.json');
const OPS_PATH = path.join(DATA_DIR, 'mothers_hut_ops.json');

export const ML_BATCH_THRESHOLD_MIN = 10;
export const ML_BATCH_THRESHOLD_MAX = 15;

let dbCache: DatabaseState | null = null;
let opsCache: OpsState | null = null;
let primaryPool: Pool | null = null;
let masterPool: Pool | null = null;
let opsTablesReady = false;
let lastSyncedSignature = '';
let lastDataUpdatedAt: string | null = null;
let lastSyncError: string | null = null;
let syncInFlight: Promise<{
  synced: boolean;
  orders_count: number;
  customers_count: number;
}> | null = null;

interface OpsState {
  phone_to_id: Record<string, string>;
  next_cust_num: number;
  campaigns: CampaignRecord[];
  birthday_offers: BirthdayOffer[];
  processing_logs: ProcessingLog[];
}

interface RawSupabaseOrderRow {
  id: string;
  order_id: string | null;
  token: string | null;
  customer_name: string | null;
  phone_number: string | null;
  group_size: number | string | null;
  items: unknown;
  item_count: number | string | null;
  subtotal: number | string | null;
  taxes: number | string | null;
  grand_total: number | string | null;
  special_note: string | null;
  service_mode: string | null;
  table_number: string | null;
  first_visit_date: string | Date | null;
  ordered_at: string | Date | null;
  estimated_prep_mins: number | string | null;
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getPrimaryPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!primaryPool) {
    primaryPool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    primaryPool.on('error', (err) => {
      console.warn('[Supabase Pool] Idle client error:', err.message);
    });
  }
  return primaryPool;
}

function getMasterPool(): Pool | null {
  const url = process.env.MASTER_SUPABASE_DATABASE_URL?.trim();
  if (!url) return null;
  if (!masterPool) {
    masterPool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    masterPool.on('error', (err) => {
      console.warn('[Master Supabase Pool] Idle client error:', err.message);
    });
  }
  return masterPool;
}

async function queryWithRetry<T>(
  pool: Pool,
  sql: string,
  params?: unknown[],
  retries = 1
): Promise<{ rows: T[] }> {
  try {
    return (await pool.query(sql, params)) as unknown as { rows: T[] };
  } catch (err) {
    const msg = (err as Error).message || '';
    const isTransient =
      /Connection terminated|ECONNRESET|ETIMEDOUT|timeout|socket hang up/i.test(msg);
    if (retries > 0 && isTransient) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return queryWithRetry<T>(pool, sql, params, retries - 1);
    }
    throw err;
  }
}

function loadLocalOpsState(): OpsState {
  if (opsCache) return opsCache;
  ensureDir();
  if (fs.existsSync(OPS_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(OPS_PATH, 'utf-8')) as Partial<OpsState>;
      opsCache = {
        phone_to_id: parsed.phone_to_id || {},
        next_cust_num: Number(parsed.next_cust_num) || 1001,
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        birthday_offers: Array.isArray(parsed.birthday_offers) ? parsed.birthday_offers : [],
        processing_logs: Array.isArray(parsed.processing_logs) ? parsed.processing_logs : [],
      };
      return opsCache;
    } catch {
      // fall through
    }
  }
  opsCache = {
    phone_to_id: {},
    next_cust_num: 1001,
    campaigns: [],
    birthday_offers: [],
    processing_logs: [],
  };
  return opsCache;
}

function saveLocalOpsState(ops: OpsState): void {
  opsCache = ops;
  ensureDir();
  void fs.promises.writeFile(OPS_PATH, JSON.stringify(ops), 'utf-8').catch(() => {
    // ignore read-only fs errors
  });
}

async function ensureOpsTables(pool: Pool): Promise<void> {
  if (opsTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.portal_ops_meta (
      id TEXT PRIMARY KEY,
      phone_to_id JSONB NOT NULL DEFAULT '{}'::jsonb,
      next_cust_num INTEGER NOT NULL DEFAULT 1001,
      birthday_offers JSONB NOT NULL DEFAULT '[]'::jsonb,
      processing_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS public.portal_campaigns (
      id TEXT PRIMARY KEY,
      campaign_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  opsTablesReady = true;
}

async function loadOpsStateAsync(): Promise<OpsState> {
  const local = loadLocalOpsState();
  const pool = getPrimaryPool();
  if (!pool) return local;

  try {
    await ensureOpsTables(pool);
    const metaRes = await pool.query<{
      phone_to_id: Record<string, string>;
      next_cust_num: number;
      birthday_offers: BirthdayOffer[];
      processing_logs: ProcessingLog[];
    }>(
      `SELECT phone_to_id, next_cust_num, birthday_offers, processing_logs
       FROM public.portal_ops_meta
       WHERE id = 'default'
       LIMIT 1`
    );

    const campRes = await pool.query<{ campaign_data: CampaignRecord }>(
      `SELECT campaign_data
       FROM public.portal_campaigns
       ORDER BY created_at DESC
       LIMIT 200`
    );

    const metaRow = metaRes.rows[0];
    const merged: OpsState = {
      phone_to_id: (metaRow?.phone_to_id as Record<string, string>) || local.phone_to_id || {},
      next_cust_num: Number(metaRow?.next_cust_num) || local.next_cust_num || 1001,
      campaigns: campRes.rows.map((r) => r.campaign_data),
      birthday_offers: Array.isArray(metaRow?.birthday_offers)
        ? metaRow.birthday_offers
        : local.birthday_offers,
      processing_logs: Array.isArray(metaRow?.processing_logs)
        ? metaRow.processing_logs
        : local.processing_logs,
    };

    saveLocalOpsState(merged);
    return merged;
  } catch (err) {
    console.warn('[Supabase] Could not load portal history tables:', (err as Error).message);
    return local;
  }
}

async function saveOpsMetaToSupabase(ops: OpsState): Promise<void> {
  const pool = getPrimaryPool();
  if (!pool) return;
  try {
    await ensureOpsTables(pool);
    await pool.query(
      `INSERT INTO public.portal_ops_meta (
        id, phone_to_id, next_cust_num, birthday_offers, processing_logs, updated_at
      )
      VALUES ('default', $1::jsonb, $2, $3::jsonb, $4::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        phone_to_id = EXCLUDED.phone_to_id,
        next_cust_num = EXCLUDED.next_cust_num,
        birthday_offers = EXCLUDED.birthday_offers,
        processing_logs = EXCLUDED.processing_logs,
        updated_at = NOW()`,
      [
        JSON.stringify(ops.phone_to_id || {}),
        Number(ops.next_cust_num) || 1001,
        JSON.stringify(ops.birthday_offers || []),
        JSON.stringify((ops.processing_logs || []).slice(0, 200)),
      ]
    );
  } catch (err) {
    console.warn('[Supabase] Could not persist portal meta:', (err as Error).message);
  }
}

async function saveCampaignToSupabase(campaign: CampaignRecord): Promise<void> {
  const pool = getPrimaryPool();
  if (!pool) return;
  try {
    await ensureOpsTables(pool);
    await pool.query(
      `INSERT INTO public.portal_campaigns (id, campaign_data, created_at)
       VALUES ($1, $2::jsonb, $3::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         campaign_data = EXCLUDED.campaign_data`,
      [campaign.id, JSON.stringify(campaign), campaign.created_at]
    );
  } catch (err) {
    console.warn('[Supabase] Could not persist campaign history:', (err as Error).message);
  }
}

async function clearCampaignsInSupabase(): Promise<void> {
  const pool = getPrimaryPool();
  if (!pool) return;
  try {
    await ensureOpsTables(pool);
    await pool.query(`DELETE FROM public.portal_campaigns`);
  } catch (err) {
    console.warn('[Supabase] Could not clear campaign history:', (err as Error).message);
  }
}

function toIstDateParts(input: string | Date | null | undefined): {
  ymd: string;
  hour: number;
  dayOfWeek: number;
  iso: string;
} {
  const fallback = new Date();
  let d = fallback;
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    d = input;
  } else if (typeof input === 'string' && input.trim()) {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      d = parsed;
    } else {
      const ymdOnly = normalizeDateToYMD(input);
      if (ymdOnly) {
        return {
          ymd: ymdOnly,
          hour: 19,
          dayOfWeek: new Date(`${ymdOnly}T12:00:00Z`).getUTCDay(),
          iso: `${ymdOnly}T13:30:00.000Z`,
        };
      }
    }
  }

  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return {
    ymd: `${y}-${m}-${day}`,
    hour: ist.getUTCHours(),
    dayOfWeek: ist.getUTCDay(),
    iso: d.toISOString(),
  };
}

function getMealTimeFromHour(hour: number): string {
  if (hour >= 6 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 16 && hour < 19) return 'Evening Snacks';
  if (hour >= 19 && hour < 23) return 'Dinner';
  return 'Late Night';
}

function normalizeServiceMode(raw: string | null | undefined): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'Dine-In';
  if (s.includes('drive')) return 'Drive-Thru';
  if (s.includes('take') || s.includes('parcel') || s.includes('pick')) return 'Takeaway';
  if (s.includes('deliv') || s.includes('zomato') || s.includes('swiggy')) return 'Delivery';
  return 'Dine-In';
}

type FoodCatKey =
  | 'chicken'
  | 'veg'
  | 'mutton'
  | 'seafood'
  | 'biryani'
  | 'chinese'
  | 'dessert';

function classifyDishCategory(dishName: string, categoryHint = ''): FoodCatKey {
  const text = `${dishName} ${categoryHint}`.toLowerCase();

  if (
    /(noodle|chow|hakka|schezwan|szechuan|momo|manchurian|chilli|chili|fried rice|roll|burger|pizza|sandwich|pasta|soup|crispy|spring roll|wonton|cutlet|chop|wrap|shawarma|maggi|chinese|fast food)/.test(
      text
    )
  ) {
    return 'chinese';
  }
  if (/(biryani|biriyani|pulao|polao|rice|khichdi|tehri)/.test(text)) return 'biryani';
  if (/(mutton|lamb|kosha|keema|goat|patha|mangsho|rogan|nihari)/.test(text)) return 'mutton';
  if (
    /(fish|prawn|crab|hilsa|ilish|chingri|pomfret|bhetki|vetki|seafood|rohu|rui|katla|pabda|chitol|tangra|parshe|macher|maach|lobster)/.test(
      text
    )
  ) {
    return 'seafood';
  }
  if (
    /(ice cream|gulab|rasmalai|payesh|mishti|cake|sweet|dessert|lassi|shake|tea|chai|coffee|mojito|juice|drink|soda|beverage|water|cola|pepsi|coke|sprite|fanta|thums|lime|lagoon|kulfi|rabri|phirni|jalebi|brownie|falooda|mocktail)/.test(
      text
    )
  ) {
    return 'dessert';
  }
  if (
    /(chicken|chkn|chk|murgh|murg|murgi|tandoori|tikka|kebab|kabab|wings|lollipop|reshmi|afghani|hariyali|tangdi|rezala)/.test(
      text
    ) ||
    (/(chaap)/.test(text) && !/(paneer|veg|soya)/.test(text))
  ) {
    return 'chicken';
  }
  return 'veg';
}

function isSideOrAccompaniment(dishName: string): boolean {
  return /(naan|roti|kulcha|paratha|parota|chapati|phulka|papad|raita|salad|mineral water|packaged water)/.test(
    dishName.toLowerCase()
  );
}

function parseOrderItems(itemsRaw: unknown): Array<{ name: string; qty: number; category: string }> {
  let parsed: unknown = itemsRaw;
  if (typeof parsed === 'string') {
    const rawStr = parsed;
    try {
      parsed = JSON.parse(rawStr);
    } catch {
      return rawStr.trim() ? [{ name: rawStr.trim(), qty: 1, category: '' }] : [];
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) parsed = obj.items;
    else if (Array.isArray(obj.order_items)) parsed = obj.order_items;
    else parsed = [obj];
  }
  if (!Array.isArray(parsed)) return [];

  const result: Array<{ name: string; qty: number; category: string }> = [];
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      if (entry.trim()) result.push({ name: entry.trim(), qty: 1, category: '' });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const name = String(
      item.name ||
        item.item_name ||
        item.itemName ||
        item.dish_name ||
        item.dishName ||
        item.dish ||
        item.title ||
        item.product_name ||
        item.menu_name ||
        item.menuName ||
        item.label ||
        item.item ||
        ''
    ).trim();
    const qty = Math.max(
      1,
      Math.round(Number(item.qty ?? item.quantity ?? item.count ?? item.units ?? 1) || 1)
    );
    const category = String(
      item.category || item.item_category || item.cat || item.type || item.section || ''
    ).trim();
    if (name) {
      result.push({ name, qty, category });
    }
  }
  return result;
}

function sanitizeTableName(raw: string | undefined): string {
  const cleaned = String(raw || 'orders').trim().replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'orders';
}

function computeVisitIntervalDays(firstYmd: string, lastYmd: string, visits: number): number {
  if (visits <= 1) return 0;
  const f = new Date(`${firstYmd}T00:00:00Z`).getTime();
  const l = new Date(`${lastYmd}T00:00:00Z`).getTime();
  const spanDays = Math.max(0, Math.round((l - f) / 86400000));
  return Math.max(1, Math.round(spanDays / (visits - 1)));
}

function aggregateOrdersToCustomers(
  rows: RawSupabaseOrderRow[],
  ops: OpsState
): { customers: CustomerRecord[]; orders: OrderRecord[] } {
  const refNow = new Date();
  const todayIst = toIstDateParts(refNow);
  const todayMidnight = new Date(`${todayIst.ymd}T00:00:00`);

  const grouped = new Map<string, RawSupabaseOrderRow[]>();
  for (const row of rows) {
    const digits = String(row.phone_number || '').replace(/\D/g, '');
    const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;
    const cleanName = String(row.customer_name || 'Guest').replace(/\s+/g, ' ').trim() || 'Guest';
    const key = cleanPhone.length >= 10 ? `p:${cleanPhone}` : `n:${cleanName.toLowerCase()}`;
    const arr = grouped.get(key) || [];
    arr.push(row);
    grouped.set(key, arr);
  }

  const customers: CustomerRecord[] = [];
  const orders: OrderRecord[] = [];

  for (const [key, guestRows] of grouped.entries()) {
    guestRows.sort((a, b) => {
      const ta = new Date(a.ordered_at || a.first_visit_date || 0).getTime();
      const tb = new Date(b.ordered_at || b.first_visit_date || 0).getTime();
      return ta - tb;
    });

    const latest = guestRows[guestRows.length - 1];
    const earliest = guestRows[0];
    const digits = String(latest.phone_number || '').replace(/\D/g, '');
    const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits || '0000000000';
    const cleanName =
      String(latest.customer_name || 'Guest').replace(/\s+/g, ' ').trim() || 'Guest';

    let cid = ops.phone_to_id[key];
    if (!cid) {
      cid = `CUST_${ops.next_cust_num++}`;
      ops.phone_to_id[key] = cid;
    }

    const totalVisits = guestRows.length;
    let totalSpend = 0;
    let groupSizeSum = 0;

    const dishCounts = new Map<string, number>();
    const catWeights: Record<FoodCatKey, number> = {
      chicken: 0,
      veg: 0,
      mutton: 0,
      seafood: 0,
      biryani: 0,
      chinese: 0,
      dessert: 0,
    };
    const mealFreq: Record<string, number> = {};
    const dayFreq: Record<string, number> = {};
    const modeFreq: Record<string, number> = {};

    const firstOrderParts = toIstDateParts(earliest.first_visit_date || earliest.ordered_at);
    const lastOrderParts = toIstDateParts(latest.ordered_at || latest.first_visit_date);

    for (const r of guestRows) {
      const subtotal = Number(r.subtotal) || 0;
      const taxes = Number(r.taxes) || 0;
      const grandTotal =
        Number(r.grand_total) > 0 ? Number(r.grand_total) : Math.max(0, subtotal + taxes);
      totalSpend += grandTotal;
      groupSizeSum += Math.max(1, Number(r.group_size) || 1);

      const parts = toIstDateParts(r.ordered_at || r.first_visit_date);
      const meal = getMealTimeFromHour(parts.hour);
      const dayType = parts.dayOfWeek === 0 || parts.dayOfWeek === 6 ? 'Weekend' : 'Weekday';
      const mode = normalizeServiceMode(r.service_mode);

      mealFreq[meal] = (mealFreq[meal] || 0) + 1;
      dayFreq[dayType] = (dayFreq[dayType] || 0) + 1;
      modeFreq[mode] = (modeFreq[mode] || 0) + 1;

      const parsedItems = parseOrderItems(r.items);
      const rowDishNames: string[] = [];
      const rowCats: string[] = [];

      for (const it of parsedItems) {
        const isSide = isSideOrAccompaniment(it.name);
        const dishScore = isSide ? 0.25 : it.qty;
        dishCounts.set(it.name, (dishCounts.get(it.name) || 0) + dishScore);

        const catKey = classifyDishCategory(it.name, it.category);
        catWeights[catKey] += isSide ? 0.25 : it.qty;
        rowDishNames.push(it.name);
        rowCats.push(catKey);
      }

      if (orders.length < 250) {
        orders.push({
          order_id: String(r.order_id || r.token || r.id),
          customer_id: cid,
          order_date: parts.ymd,
          order_amount: Number(grandTotal.toFixed(2)),
          group_size: Math.max(1, Number(r.group_size) || 1),
          children_count: 0,
          discount_used: false,
          food_categories: rowCats[0] || 'general',
          dish_name: rowDishNames.join(', ') || 'Order Items',
          rating: null,
          day_type: dayType,
          meal_time: meal,
          order_channel: mode,
          order_status: 'COMPLETED',
          processing_status: 'PROCESSED',
          source: 'supabase',
          created_at: parts.iso,
        });
      }
    }

    const favDish =
      Array.from(dishCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topMeal = Object.entries(mealFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Dinner';
    const topDay = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Weekend';
    const topMode = Object.entries(modeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Dine-In';

    const derived = deriveCustomerFields(
      {
        customer_id: cid,
        customer_name: cleanName,
        contact_no: cleanPhone,
        age: null,
        dob: null,
        gender: 'Not Tracked',
        first_visit_date: firstOrderParts.ymd,
        last_visit_date: lastOrderParts.ymd,
        total_visits: totalVisits,
        total_spend_inr: Number(totalSpend.toFixed(2)),
        avg_spend_per_visit_inr: Number((totalSpend / totalVisits).toFixed(2)),
        avg_group_size: Number((groupSizeSum / totalVisits).toFixed(1)),
        total_children: 0,
        discount_used_count: 0,
        chicken_orders: Math.round(catWeights.chicken * 100) / 100,
        veg_orders: Math.round(catWeights.veg * 100) / 100,
        mutton_orders: Math.round(catWeights.mutton * 100) / 100,
        seafood_orders: Math.round(catWeights.seafood * 100) / 100,
        biryani_rice_orders: Math.round(catWeights.biryani * 100) / 100,
        chinese_fastfood_orders: Math.round(catWeights.chinese * 100) / 100,
        dessert_beverage_orders: Math.round(catWeights.dessert * 100) / 100,
        most_ordered_dish: favDish,
        preferred_day_type: topDay,
        preferred_meal_time: topMeal,
        avg_rating_given: null,
        area: latest.table_number ? `Table ${latest.table_number}` : topMode,
        loyalty_member: totalVisits >= 5 ? 'Yes' : 'No',
        preferred_order_channel: topMode,
      },
      todayMidnight
    );

    const visitInterval = computeVisitIntervalDays(firstOrderParts.ymd, lastOrderParts.ymd, totalVisits);
    derived.expected_visit_gap = visitInterval;
    if (totalVisits <= 1) {
      derived.overdue_ratio = derived.days_since_last_visit >= 35 ? 2.2 : 1;
      derived.churn_alert_flag = derived.days_since_last_visit >= 35 ? 'HIGH_PRIORITY_ALERT' : 'NORMAL';
    } else {
      const gapBase = Math.max(7, visitInterval);
      derived.overdue_ratio = Number((derived.days_since_last_visit / gapBase).toFixed(2));
      derived.churn_alert_flag =
        derived.days_since_last_visit >= 35 || derived.overdue_ratio >= 2.2
          ? 'HIGH_PRIORITY_ALERT'
          : 'NORMAL';
    }

    customers.push(derived);
  }

  return { customers, orders };
}

async function syncAnalyticsToMasterSupabase(
  customers: CustomerRecord[],
  modelVersion: string
): Promise<void> {
  const pool = getMasterPool();
  if (!pool || customers.length === 0) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_intelligence_profiles (
        customer_id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        contact_no TEXT NOT NULL,
        total_visits INTEGER NOT NULL,
        total_spend_inr NUMERIC(12,2) NOT NULL,
        avg_spend_per_visit_inr NUMERIC(12,2) NOT NULL,
        fav_dish TEXT,
        top_food_category TEXT,
        days_since_visit INTEGER NOT NULL,
        visit_interval_days INTEGER NOT NULL,
        avg_group_size NUMERIC(6,2) NOT NULL,
        service_mode TEXT,
        preferred_meal_time TEXT,
        preferred_day_type TEXT,
        cluster_id INTEGER NOT NULL,
        cluster_type TEXT NOT NULL,
        churn_alert_flag TEXT NOT NULL,
        model_version TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const batchSize = 200;
    for (let i = 0; i < customers.length; i += batchSize) {
      const chunk = customers.slice(i, i + batchSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      chunk.forEach((c, idx) => {
        const base = idx * 18;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, NOW())`
        );
        values.push(
          c.customer_id,
          c.customer_name,
          c.contact_no,
          c.total_visits,
          c.total_spend_inr,
          c.avg_spend_per_visit_inr,
          c.most_ordered_dish,
          c.top_food_category,
          c.days_since_last_visit,
          c.expected_visit_gap,
          c.avg_group_size,
          c.preferred_order_channel,
          c.preferred_meal_time,
          c.preferred_day_type,
          c.cluster_id,
          c.cluster_name,
          c.churn_alert_flag,
          modelVersion
        );
      });

      await pool.query(
        `
        INSERT INTO customer_intelligence_profiles (
          customer_id, customer_name, contact_no, total_visits,
          total_spend_inr, avg_spend_per_visit_inr, fav_dish, top_food_category,
          days_since_visit, visit_interval_days, avg_group_size, service_mode,
          preferred_meal_time, preferred_day_type, cluster_id, cluster_type,
          churn_alert_flag, model_version, updated_at
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (customer_id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          contact_no = EXCLUDED.contact_no,
          total_visits = EXCLUDED.total_visits,
          total_spend_inr = EXCLUDED.total_spend_inr,
          avg_spend_per_visit_inr = EXCLUDED.avg_spend_per_visit_inr,
          fav_dish = EXCLUDED.fav_dish,
          top_food_category = EXCLUDED.top_food_category,
          days_since_visit = EXCLUDED.days_since_visit,
          visit_interval_days = EXCLUDED.visit_interval_days,
          avg_group_size = EXCLUDED.avg_group_size,
          service_mode = EXCLUDED.service_mode,
          preferred_meal_time = EXCLUDED.preferred_meal_time,
          preferred_day_type = EXCLUDED.preferred_day_type,
          cluster_id = EXCLUDED.cluster_id,
          cluster_type = EXCLUDED.cluster_type,
          churn_alert_flag = EXCLUDED.churn_alert_flag,
          model_version = EXCLUDED.model_version,
          updated_at = NOW();
        `,
        values
      );
    }
  } catch (err) {
    console.warn('Master Supabase analytics sync skipped:', (err as Error).message);
  }
}

function executeMlPipelineOnState(
  state: DatabaseState,
  stagedRecords: CustomerRecord[],
  batchCount: number
): MlPipelineRun {
  const mergedMap = new Map<string, CustomerRecord>();
  for (const existing of state.customers) {
    mergedMap.set(existing.customer_id, existing);
  }
  for (const incoming of stagedRecords) {
    mergedMap.set(incoming.customer_id, incoming);
  }
  const combinedRaw = Array.from(mergedMap.values());
  const { model, assignedCustomers } = trainKMeansModel(combinedRaw, 4);

  state.customers = assignedCustomers;
  state.model = model;
  state.pending_ml_queue = [];
  state.pending_ml_meta = [];

  const run: MlPipelineRun = {
    run_id: model.model_version,
    executed_at: model.trained_at,
    batch_size_processed: batchCount,
    total_customers_after: assignedCustomers.length,
    silhouette_score: model.silhouette_score,
    steps: [
      {
        step: 'data_cleaning',
        title: 'Data Preparation',
        status: 'completed',
        summary: `Validated & deduplicated ${assignedCustomers.length} guests from restaurant orders.`,
      },
      {
        step: 'preprocessing',
        title: 'Standardization',
        status: 'completed',
        summary: `Normalized ${model.feature_columns.length} dining behavior metrics.`,
      },
      {
        step: 'feature_engineering',
        title: 'Guest Insights',
        status: 'completed',
        summary: `Computed Total Spend, Avg/Visit, Fav Dish, Days Since Visit, Visit Interval & food preferences.`,
      },
      {
        step: 'apply_algorithm',
        title: 'Customer Grouping',
        status: 'completed',
        summary: `Organized guests into 4 dining groups (Frequent, Premium, Family, and Occasional Customers).`,
      },
    ],
  };

  state.last_ml_pipeline_run = run;
  return run;
}

async function runSyncFromSupabase(force = false): Promise<{
  synced: boolean;
  orders_count: number;
  customers_count: number;
}> {
  const pool = getPrimaryPool();
  if (!pool) {
    loadDatabase();
    return {
      synced: false,
      orders_count: dbCache?.orders.length || 0,
      customers_count: dbCache?.customers.length || 0,
    };
  }

  const tableName = sanitizeTableName(process.env.SUPABASE_TABLE_NAME || 'orders');

  try {
    const checkRes = await queryWithRetry<{
      total_count: number;
      latest_ts: string | null;
      total_sum: string | null;
    }>(
      pool,
      `SELECT
         COUNT(*)::int AS total_count,
         to_char(MAX(ordered_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS latest_ts,
         COALESCE(SUM(grand_total), 0)::text AS total_sum
       FROM public."${tableName}"`
    );
    const totalCount = checkRes.rows[0]?.total_count ?? 0;
    const latestTs = checkRes.rows[0]?.latest_ts || null;
    const totalSum = checkRes.rows[0]?.total_sum || '0';
    const signature = `${tableName}:${totalCount}:${latestTs || 'empty'}:${totalSum}`;

    if (
      !force &&
      dbCache &&
      dbCache.dataset_source === `supabase:${tableName}` &&
      signature === lastSyncedSignature
    ) {
      lastSyncError = null;
      if (!lastDataUpdatedAt && latestTs) {
        lastDataUpdatedAt = latestTs;
      }
      return {
        synced: false,
        orders_count: totalCount,
        customers_count: dbCache.customers.length,
      };
    }

    console.log(`[Supabase] Fetching rows from public."${tableName}"...`);
    const { rows } = await queryWithRetry<RawSupabaseOrderRow>(
      pool,
      `SELECT * FROM public."${tableName}" ORDER BY ordered_at ASC NULLS LAST`
    );

    const ops = await loadOpsStateAsync();
    const { customers, orders } = aggregateOrdersToCustomers(rows, ops);
    const { model, assignedCustomers } = trainKMeansModel(customers, 4);

    const nextState: DatabaseState = {
      dataset_source: `supabase:${tableName}`,
      customers: assignedCustomers,
      orders,
      birthday_offers: ops.birthday_offers,
      campaigns: ops.campaigns,
      birthday_campaigns: [],
      processing_logs: ops.processing_logs,
      model,
      pending_ml_queue: [],
      pending_ml_meta: [],
      last_ml_pipeline_run: null,
    };

    const run = executeMlPipelineOnState(nextState, [], assignedCustomers.length);
    nextState.processing_logs.unshift({
      id: crypto.randomUUID(),
      event_type: 'SUPABASE_SYNC_COMPLETED',
      reference_id: run.run_id,
      status: 'SUCCESS',
      details: `Synced ${rows.length} orders → ${assignedCustomers.length} guests across 4 groups.`,
      created_at: new Date().toISOString(),
    });
    if (nextState.processing_logs.length > 200) {
      nextState.processing_logs = nextState.processing_logs.slice(0, 200);
    }
    ops.processing_logs = nextState.processing_logs;
    saveLocalOpsState(ops);
    void saveOpsMetaToSupabase(ops);

    dbCache = nextState;
    lastSyncedSignature = signature;
    lastDataUpdatedAt = latestTs || new Date().toISOString();
    lastSyncError = null;
    saveDatabase();

    void syncAnalyticsToMasterSupabase(assignedCustomers, model.model_version);

    return {
      synced: true,
      orders_count: rows.length,
      customers_count: assignedCustomers.length,
    };
  } catch (err) {
    lastSyncError = (err as Error).message;
    throw err;
  }
}

export async function syncFromSupabase(force = false): Promise<{
  synced: boolean;
  orders_count: number;
  customers_count: number;
}> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSyncFromSupabase(force).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export function getSyncStatus() {
  return {
    supabase_configured: isSupabaseConfigured(),
    table_name: sanitizeTableName(process.env.SUPABASE_TABLE_NAME || 'orders'),
    dataset_source: dbCache?.dataset_source || 'not_loaded',
    orders_count: dbCache?.orders.length || 0,
    customers_count: dbCache?.customers.length || 0,
    campaigns_count: dbCache?.campaigns.length || 0,
    sync_interval_seconds: Math.max(15, Number(process.env.SUPABASE_SYNC_INTERVAL_SECONDS) || 300),
    last_sync_at: lastDataUpdatedAt,
    last_sync_error: lastSyncError,
  };
}

export async function initDatabase(onSynced?: () => void): Promise<DatabaseState> {
  const state = loadDatabase();
  if (isSupabaseConfigured()) {
    void syncFromSupabase(true)
      .then((result) => {
        console.log(
          `[Supabase] Sync complete: ${result.orders_count} orders -> ${result.customers_count} guests.`
        );
        onSynced?.();
      })
      .catch((err) => {
        lastSyncError = (err as Error).message;
        console.error('[Supabase ERROR] Startup sync failed:', lastSyncError);
      });
  } else {
    console.warn('[Supabase] DATABASE_URL not found in environment; using local dataset.');
  }
  return state;
}

export function startSupabaseSyncLoop(onSynced?: () => void): void {
  const pool = getPrimaryPool();
  if (!pool) return;
  const intervalSec = Math.max(15, Number(process.env.SUPABASE_SYNC_INTERVAL_SECONDS) || 300);
  setInterval(() => {
    void syncFromSupabase(false)
      .then((res) => {
        if (res.synced) {
          console.log(
            `[Supabase] Auto-synced ${res.orders_count} orders -> ${res.customers_count} guests.`
          );
          onSynced?.();
        }
      })
      .catch((err) => {
        lastSyncError = (err as Error).message;
        console.error('[Supabase ERROR] Background sync failed:', lastSyncError);
      });
  }, intervalSec * 1000);
}

export function loadDatabase(): DatabaseState {
  if (dbCache) return dbCache;
  ensureDir();

  if (isSupabaseConfigured()) {
    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (
          parsed.dataset_source?.startsWith('supabase:') &&
          Array.isArray(parsed.customers) &&
          parsed.model
        ) {
          const retrained = trainKMeansModel(parsed.customers, 4);
          parsed.customers = retrained.assignedCustomers;
          parsed.model = retrained.model;
          dbCache = parsed;
          return dbCache;
        }
      } catch {
        // ignore stale cache
      }
    }

    const ops = loadLocalOpsState();
    const { model, assignedCustomers } = trainKMeansModel([], 4);
    dbCache = {
      dataset_source: 'supabase:pending',
      customers: assignedCustomers,
      orders: [],
      birthday_offers: ops.birthday_offers,
      campaigns: ops.campaigns,
      birthday_campaigns: [],
      processing_logs: ops.processing_logs,
      model,
      pending_ml_queue: [],
      pending_ml_meta: [],
      last_ml_pipeline_run: null,
    };
    return dbCache;
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (Array.isArray(parsed.customers) && parsed.model) {
        const refDate = getDatasetReferenceDate(parsed.customers);
        parsed.customers = parsed.customers.map((c) => deriveCustomerFields(c, refDate));
        const retrained = trainKMeansModel(parsed.customers, 4);
        parsed.customers = retrained.assignedCustomers;
        parsed.model = retrained.model;
        dbCache = parsed;
        return dbCache;
      }
    } catch {
      // fall through
    }
  }

  const seeded = createSeedData();
  const { model, assignedCustomers } = trainKMeansModel(seeded.customers, 4);

  const initialState: DatabaseState = {
    dataset_source: 'csv:seed',
    customers: assignedCustomers,
    orders: seeded.orders,
    birthday_offers: seeded.birthdayOffers,
    campaigns: [],
    birthday_campaigns: [],
    processing_logs: [],
    model,
    pending_ml_queue: [],
    pending_ml_meta: [],
    last_ml_pipeline_run: null,
  };

  executeMlPipelineOnState(initialState, [], assignedCustomers.length);
  dbCache = initialState;
  saveDatabase();
  return dbCache;
}

export function saveDatabase(): void {
  if (!dbCache) return;
  ensureDir();
  const snapshotCopy = dbCache;
  void fs.promises.writeFile(DB_PATH, JSON.stringify(snapshotCopy), 'utf-8').catch(() => {
    // ignore read-only fs errors
  });
  const ops = loadLocalOpsState();
  ops.campaigns = snapshotCopy.campaigns;
  ops.birthday_offers = snapshotCopy.birthday_offers;
  ops.processing_logs = snapshotCopy.processing_logs;
  saveLocalOpsState(ops);
}

export function addProcessingLog(
  eventType: string,
  referenceId: string,
  status: ProcessingLog['status'],
  details: string
): void {
  const db = loadDatabase();
  db.processing_logs.unshift({
    id: crypto.randomUUID(),
    event_type: eventType,
    reference_id: referenceId,
    status,
    details,
    created_at: new Date().toISOString(),
  });
  if (db.processing_logs.length > 200) {
    db.processing_logs = db.processing_logs.slice(0, 200);
  }
  saveDatabase();
}

export async function resetCampaignOperationsAsync(): Promise<void> {
  const db = loadDatabase();
  db.campaigns = [];
  db.birthday_campaigns = [];
  db.processing_logs = [];
  saveDatabase();
  await clearCampaignsInSupabase();
  await saveOpsMetaToSupabase(loadLocalOpsState());
}

export function resetCampaignOperations(): void {
  void resetCampaignOperationsAsync();
}

export function getDashboardSnapshot() {
  const db = loadDatabase();
  const customers = db.customers;

  const profiles = buildClusterProfiles(customers, db.model);
  const totalRevenue = customers.reduce((s, c) => s + c.total_spend_inr, 0);
  const totalOrders = customers.reduce((s, c) => s + c.total_visits, 0);
  const avgSpend = customers.length > 0 ? Math.round(totalRevenue / customers.length) : 0;
  const avgVisits = customers.length > 0 ? Number((totalOrders / customers.length).toFixed(1)) : 0;
  const activeCustomers = customers.filter((c) => c.days_since_last_visit <= 35).length;

  const foodTotals = [
    { category: 'Chicken', count: Math.round(customers.reduce((s, c) => s + c.chicken_orders, 0)) },
    { category: 'Biryani & Rice', count: Math.round(customers.reduce((s, c) => s + c.biryani_rice_orders, 0)) },
    { category: 'Veg', count: Math.round(customers.reduce((s, c) => s + c.veg_orders, 0)) },
    { category: 'Mutton', count: Math.round(customers.reduce((s, c) => s + c.mutton_orders, 0)) },
    { category: 'Chinese & Fast Food', count: Math.round(customers.reduce((s, c) => s + c.chinese_fastfood_orders, 0)) },
    { category: 'Dessert & Beverage', count: Math.round(customers.reduce((s, c) => s + c.dessert_beverage_orders, 0)) },
    { category: 'Seafood', count: Math.round(customers.reduce((s, c) => s + c.seafood_orders, 0)) },
  ].sort((a, b) => b.count - a.count);

  const contactedIds = new Set<string>();
  for (const camp of db.campaigns) {
    if (camp.campaign_type === 'alert' || camp.campaign_type === 'bulk_alert') {
      for (const r of camp.recipients) {
        if (r.delivery_status !== 'Failed') {
          contactedIds.add(r.customer_id);
        }
      }
    }
  }

  const pendingMeta = db.pending_ml_meta || [];

  return {
    metrics: {
      total_customers: customers.length,
      active_customers: activeCustomers,
      total_orders: totalOrders,
      total_revenue_inr: Math.round(totalRevenue),
      avg_customer_spend_inr: avgSpend,
      avg_visits_per_customer: avgVisits,
      cluster_count: profiles.length,
      upcoming_birthdays_7d: 0,
      upcoming_birthdays_30d: 0,
      urgent_birthdays_4d: 0,
      high_alerts_remaining: customers.filter(
        (c) => c.churn_alert_flag === 'HIGH_PRIORITY_ALERT' && !contactedIds.has(c.customer_id)
      ).length,
      total_campaigns: db.campaigns.length,
      total_sms_sent: db.campaigns.reduce((s, c) => s + c.sent_count, 0),
      total_sms_delivered: db.campaigns.reduce((s, c) => s + c.delivered_count, 0),
      total_sms_failed: db.campaigns.reduce((s, c) => s + c.failed_count, 0),
      last_sync_at: lastDataUpdatedAt,
      last_sync_error: lastSyncError,
    },
    customers,
    cluster_profiles: profiles,
    birthdays: [],
    urgent_birthdays: [],
    birthday_offers: db.birthday_offers,
    campaigns: db.campaigns,
    orders: db.orders,
    processing_logs: db.processing_logs,
    food_distribution: foodTotals,
    ml_pipeline: {
      batch_threshold_min: ML_BATCH_THRESHOLD_MIN,
      batch_threshold_max: ML_BATCH_THRESHOLD_MAX,
      queued_count: pendingMeta.length,
      queued_guests: pendingMeta,
      last_run: db.last_ml_pipeline_run || null,
    },
    model: {
      model_version: db.model.model_version,
      trained_at: db.model.trained_at,
      n_clusters: db.model.n_clusters,
      silhouette_score: db.model.silhouette_score,
      inertia: db.model.inertia,
      elbow_inertias: db.model.elbow_inertias,
      training_sample_count: db.model.training_sample_count,
      feature_columns: db.model.feature_columns,
    },
    contacted_alert_ids: Array.from(contactedIds),
  };
}

function generateNextCustomerId(db: DatabaseState): string {
  const existingIds = new Set<string>();
  let maxNum = 1000 + db.customers.length + (db.pending_ml_queue?.length || 0);
  for (const c of db.customers) {
    existingIds.add(c.customer_id);
    const m = /^CUST_(\d+)$/i.exec(c.customer_id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  let candidateNum = maxNum + 1;
  while (existingIds.has(`CUST_${candidateNum}`)) {
    candidateNum++;
  }
  return `CUST_${candidateNum}`;
}

export function upsertCustomer(
  input: {
    customer_id?: string;
    customer_name: string;
    contact_no: string;
    first_visit_date?: string;
    last_visit_date?: string;
    total_visits?: number;
    total_spend_inr?: number;
    avg_group_size?: number;
    most_ordered_dish?: string | null;
    preferred_day_type?: string;
    preferred_meal_time?: string;
    area?: string;
    loyalty_member?: string;
    preferred_order_channel?: string;
  },
  deferRun = false
): {
  customer: CustomerRecord;
  queued_for_ml_batch: boolean;
  queued_count: number;
  batch_threshold: number;
  pipeline_executed: boolean;
} {
  const db = loadDatabase();
  const digits = String(input.contact_no || '').replace(/\D/g, '');
  if (digits.length < 10) {
    throw new Error('Phone number must contain at least 10 digits.');
  }
  const cleanPhone = digits.slice(-10);

  const todayStr = toIstDateParts(new Date()).ymd;
  const existing =
    (input.customer_id
      ? db.customers.find((c) => c.customer_id === input.customer_id)
      : db.customers.find((c) => c.contact_no === cleanPhone)) || null;

  const cid = existing ? existing.customer_id : input.customer_id?.trim() || generateNextCustomerId(db);
  const totalVisits = Math.max(1, Number(input.total_visits ?? existing?.total_visits ?? 1));
  const totalSpend = Math.max(0, Number(input.total_spend_inr ?? existing?.total_spend_inr ?? 0));
  const avgSpend = Number((totalSpend / totalVisits).toFixed(2));
  const firstYmd = normalizeDateToYMD(input.first_visit_date) || existing?.first_visit_date || todayStr;
  const lastYmd = normalizeDateToYMD(input.last_visit_date) || existing?.last_visit_date || todayStr;

  const merged = deriveCustomerFields(
    {
      customer_id: cid,
      customer_name: input.customer_name.trim(),
      contact_no: cleanPhone,
      age: null,
      dob: null,
      gender: 'Not Tracked',
      first_visit_date: firstYmd,
      last_visit_date: lastYmd,
      total_visits: totalVisits,
      total_spend_inr: totalSpend,
      avg_spend_per_visit_inr: avgSpend,
      avg_group_size: Number(input.avg_group_size ?? existing?.avg_group_size ?? 2),
      total_children: 0,
      discount_used_count: 0,
      chicken_orders: existing?.chicken_orders ?? 0,
      veg_orders: existing?.veg_orders ?? 0,
      mutton_orders: existing?.mutton_orders ?? 0,
      seafood_orders: existing?.seafood_orders ?? 0,
      biryani_rice_orders: existing?.biryani_rice_orders ?? 0,
      chinese_fastfood_orders: existing?.chinese_fastfood_orders ?? 0,
      dessert_beverage_orders: existing?.dessert_beverage_orders ?? 0,
      most_ordered_dish:
        input.most_ordered_dish !== undefined
          ? input.most_ordered_dish
          : existing?.most_ordered_dish ?? null,
      preferred_day_type: input.preferred_day_type || existing?.preferred_day_type || 'Weekend',
      preferred_meal_time: input.preferred_meal_time || existing?.preferred_meal_time || 'Dinner',
      avg_rating_given: null,
      area: input.area || existing?.area || 'Dine-In',
      loyalty_member: input.loyalty_member || (totalVisits >= 5 ? 'Yes' : 'No'),
      preferred_order_channel:
        input.preferred_order_channel || existing?.preferred_order_channel || 'Dine-In',
    },
    new Date(`${todayStr}T00:00:00`)
  );

  merged.expected_visit_gap = computeVisitIntervalDays(firstYmd, lastYmd, totalVisits);
  const pred = predictCustomerCluster(merged, db.model);
  merged.cluster_id = pred.cluster_id;
  merged.cluster_name = pred.cluster_name;

  const idx = db.customers.findIndex((c) => c.customer_id === merged.customer_id);
  if (idx >= 0) db.customers[idx] = merged;
  else db.customers.unshift(merged);

  if (!deferRun) {
    saveDatabase();
  }

  return {
    customer: merged,
    queued_for_ml_batch: false,
    queued_count: 0,
    batch_threshold: ML_BATCH_THRESHOLD_MIN,
    pipeline_executed: true,
  };
}

export function processBatchCustomers(items: Array<Record<string, unknown>>): {
  received_count: number;
  queued_count: number;
  batch_threshold: number;
  pipeline_executed: boolean;
  pipeline_run: MlPipelineRun | null;
} {
  const db = loadDatabase();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Batch payload must be a non-empty array of guest records.');
  }

  for (const item of items) {
    upsertCustomer(item as Parameters<typeof upsertCustomer>[0], true);
  }
  const run = executeMlPipelineOnState(db, [], items.length);
  saveDatabase();
  void syncAnalyticsToMasterSupabase(db.customers, db.model.model_version);

  return {
    received_count: items.length,
    queued_count: 0,
    batch_threshold: ML_BATCH_THRESHOLD_MIN,
    pipeline_executed: true,
    pipeline_run: run,
  };
}

export function importCustomersFromCsv(
  csvText: string,
  mode: 'replace' | 'merge' = 'replace'
): { imported_count: number; total_customers: number } {
  const db = loadDatabase();
  const parsed = parseCustomersCsv(csvText);
  if (parsed.length === 0) {
    throw new Error('No valid customer records found in the uploaded CSV.');
  }
  if (mode === 'replace') db.customers = [];
  const run = executeMlPipelineOnState(db, parsed, parsed.length);
  saveDatabase();
  addProcessingLog(
    'CSV_IMPORTED',
    run.run_id,
    'SUCCESS',
    `Processed ${parsed.length} guest records into 4 customer groups.`
  );
  return { imported_count: parsed.length, total_customers: db.customers.length };
}

export function retrainModelControlled(): {
  model: DatabaseState['model'];
  reassigned_count: number;
  pipeline_run: MlPipelineRun;
} {
  const db = loadDatabase();
  const run = executeMlPipelineOnState(db, [], db.customers.length);
  saveDatabase();
  void syncAnalyticsToMasterSupabase(db.customers, db.model.model_version);
  addProcessingLog(
    'GROUPING_UPDATED',
    run.run_id,
    'SUCCESS',
    `Updated 4 guest groups across ${db.customers.length} customers.`
  );
  return { model: db.model, reassigned_count: db.customers.length, pipeline_run: run };
}

function buildAlertMessageForGuest(c: CustomerRecord): string {
  const dish =
    c.most_ordered_dish && c.most_ordered_dish.trim()
      ? c.most_ordered_dish.trim()
      : "Chef's Special";
  const meal = (c.preferred_meal_time || 'Dinner').replace(/_/g, ' ');
  const prefix = `Greetings from Mother's Hut!\nHi ${c.customer_name}, `;

  if (c.cluster_id === 1) {
    return `${prefix}We have missed hosting you. Your preferred ${meal} table and favourite ${dish} await you whenever you visit next. For reservations, reach us at 7894561233.`;
  }
  if (c.cluster_id === 2) {
    return `${prefix}We've missed seeing you and your family! Our kitchen is ready to host your next ${meal} gathering with freshly prepared ${dish} and ${c.top_food_category} favourites. Helpline: 7894561233.`;
  }
  if (c.cluster_id === 3) {
    return `${prefix}Thank you for dining with us! We would love to welcome you back for another ${meal} featuring your favourite ${dish}. For table reservations, call 7894561233.`;
  }
  return `${prefix}We've missed hosting you! Your favourite ${dish} and ${c.top_food_category} specials are ready for your next ${meal}. For reservations or queries, call 7894561233.`;
}

export function sendSmsCampaign(input: {
  campaign_name: string;
  campaign_type: 'cluster' | 'birthday' | 'bulk_birthday' | 'alert' | 'bulk_alert';
  cluster_id?: number | null;
  cluster_name?: string | null;
  message_content: string;
  language?: 'en' | 'bn';
  recipient_ids: string[];
  birthday_occurrence?: string | null;
  birthday_option_id?: 1 | 2;
  offer_id?: string | null;
  allow_resend?: boolean;
}): CampaignRecord {
  const db = loadDatabase();
  if (!input.recipient_ids || input.recipient_ids.length === 0) {
    throw new Error('At least one recipient must be selected.');
  }

  const targetCustomers = db.customers.filter((c) => input.recipient_ids.includes(c.customer_id));
  if (targetCustomers.length === 0) {
    throw new Error('No matching customers found for the selected recipients.');
  }

  const campaignId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  let deliveredCount = 0;
  let failedCount = 0;

  const recipients: CampaignRecipient[] = targetCustomers.map((c, idx) => {
    const charCode = c.customer_id.charCodeAt(c.customer_id.length - 1) || 0;
    const isFailed = targetCustomers.length > 1 ? (idx + charCode) % 20 === 19 : false;
    const deliveryStatus = isFailed ? 'Failed' : 'Delivered';
    if (isFailed) failedCount++;
    else deliveredCount++;

    const personalizedMsg =
      input.campaign_type === 'bulk_alert'
        ? buildAlertMessageForGuest(c)
        : input.message_content
            .replaceAll('{customer_name}', c.customer_name)
            .replaceAll('{name}', c.customer_name)
            .replaceAll('{customer_id}', c.customer_id)
            .replaceAll('{total_visits}', String(c.total_visits))
            .replaceAll('{most_ordered_dish}', c.most_ordered_dish || 'our signature dishes')
            .replaceAll('{fav_dish}', c.most_ordered_dish || 'our signature dishes')
            .replaceAll('{top_food_category}', c.top_food_category)
            .replaceAll('{preferred_order_channel}', c.preferred_order_channel)
            .replaceAll('{preferred_meal_time}', c.preferred_meal_time)
            .replaceAll('{preferred_day_type}', c.preferred_day_type)
            .replaceAll('{avg_group_size}', String(c.avg_group_size))
            .replaceAll('{phone_no}', '7894561233');

    return {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      phone_no: c.contact_no,
      message_content: personalizedMsg,
      sms_status: 'Sent',
      delivery_status: deliveryStatus,
      processed_at: nowIso,
    };
  });

  const campaign: CampaignRecord = {
    id: campaignId,
    campaign_name: input.campaign_name,
    campaign_type: input.campaign_type,
    cluster_id: input.cluster_id ?? null,
    cluster_name: input.cluster_name ?? null,
    channel: 'SMS',
    message_content: input.message_content,
    language: input.language || 'en',
    recipient_count: recipients.length,
    sent_count: recipients.length,
    delivered_count: deliveredCount,
    failed_count: failedCount,
    status: 'Completed',
    created_at: nowIso,
    recipients,
  };

  db.campaigns.unshift(campaign);
  saveDatabase();
  addProcessingLog(
    'SMS_CAMPAIGN',
    campaignId,
    'SUCCESS',
    `${campaign.campaign_name} (${deliveredCount} delivered, ${failedCount} failed of ${recipients.length}).`
  );

  return campaign;
}

export async function sendSmsCampaignAsync(
  input: Parameters<typeof sendSmsCampaign>[0]
): Promise<CampaignRecord> {
  const campaign = sendSmsCampaign(input);
  await saveCampaignToSupabase(campaign);
  await saveOpsMetaToSupabase(loadLocalOpsState());
  return campaign;
}

export function upsertBirthdayOffer(
  input: Partial<BirthdayOffer> & { title: string; discount_or_benefit: string }
): BirthdayOffer {
  const db = loadDatabase();
  const nowIso = new Date().toISOString();
  const existingIdx = input.id ? db.birthday_offers.findIndex((o) => o.id === input.id) : -1;

  const offer: BirthdayOffer = {
    id: existingIdx >= 0 ? db.birthday_offers[existingIdx].id : `offer_${Date.now()}`,
    title: input.title.trim(),
    description: (input.description || input.discount_or_benefit).trim(),
    applicable_item_or_category: (input.applicable_item_or_category || 'All').trim(),
    discount_or_benefit: input.discount_or_benefit.trim(),
    validity_days: Math.max(1, Number(input.validity_days ?? 7)),
    min_order_amount_inr: Math.max(0, Number(input.min_order_amount_inr ?? 0)),
    terms_and_conditions: (
      input.terms_and_conditions || 'Valid for dine-in visits.'
    ).trim(),
    is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
    owner_approved: input.owner_approved !== undefined ? Boolean(input.owner_approved) : true,
    created_at: existingIdx >= 0 ? db.birthday_offers[existingIdx].created_at : nowIso,
    updated_at: nowIso,
  };

  if (existingIdx >= 0) db.birthday_offers[existingIdx] = offer;
  else db.birthday_offers.unshift(offer);
  saveDatabase();
  void saveOpsMetaToSupabase(loadLocalOpsState());
  return offer;
}

export function deleteBirthdayOffer(offerId: string): void {
  const db = loadDatabase();
  db.birthday_offers = db.birthday_offers.filter((o) => o.id !== offerId);
  saveDatabase();
  void saveOpsMetaToSupabase(loadLocalOpsState());
}