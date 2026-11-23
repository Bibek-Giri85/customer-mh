import type { BirthdayOffer, CampaignRecord, CustomerRecord, DashboardSnapshot } from '../types';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const rawText = await res.text();
  let parsed: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      throw new Error('Server returned an unexpected non-JSON response.');
    }
  }

  if (!res.ok) {
    const errMsg =
      (parsed && typeof parsed.error === 'string' && parsed.error) ||
      (parsed && typeof parsed.detail === 'string' && parsed.detail) ||
      `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  if (!parsed) {
    throw new Error('Server returned an empty response.');
  }

  return parsed as unknown as T;
}

function isValidDashboardSnapshot(data: unknown): data is DashboardSnapshot {
  if (!data || typeof data !== 'object') return false;
  const s = data as Partial<DashboardSnapshot>;
  return Boolean(
    s.metrics &&
      typeof s.metrics.upcoming_birthdays_7d === 'number' &&
      Array.isArray(s.customers) &&
      Array.isArray(s.cluster_profiles) &&
      Array.isArray(s.birthdays)
  );
}

export const api = {
  getDashboard: async (): Promise<DashboardSnapshot> => {
    const data = await requestJson<DashboardSnapshot>('/api/dashboard');
    if (!isValidDashboardSnapshot(data)) {
      throw new Error('Incomplete dashboard payload received from server.');
    }
    return data;
  },

  syncNow: () =>
    requestJson<{
      synced: boolean;
      orders_count: number;
      customers_count: number;
      snapshot: DashboardSnapshot;
    }>('/api/sync', {
      method: 'POST',
    }),

  upsertCustomer: (payload: Partial<CustomerRecord> & { customer_name: string; contact_no: string }) =>
    requestJson<{
      customer: CustomerRecord;
      queued_for_ml_batch: boolean;
      queued_count: number;
      batch_threshold: number;
      pipeline_executed: boolean;
      snapshot: DashboardSnapshot;
    }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runMlPipelineNow: () =>
    requestJson<{
      reassigned_count: number;
      snapshot: DashboardSnapshot;
    }>('/api/ml/retrain', {
      method: 'POST',
    }),

  upsertBirthdayOffer: (payload: Partial<BirthdayOffer> & { title: string; discount_or_benefit: string }) =>
    requestJson<{ offer: BirthdayOffer; snapshot: DashboardSnapshot }>('/api/birthday-offers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteBirthdayOffer: (offerId: string) =>
    requestJson<{ ok: boolean; snapshot: DashboardSnapshot }>(
      `/api/birthday-offers/${encodeURIComponent(offerId)}`,
      {
        method: 'DELETE',
      }
    ),

  sendSmsCampaign: (payload: {
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
  }) =>
    requestJson<{ campaign: CampaignRecord; snapshot: DashboardSnapshot }>(
      '/api/campaigns/send',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
};