import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { OverviewPage } from './components/OverviewPage';
import { api } from './services/api';
import type {
  CampaignRecord,
  CustomerRecord,
  DashboardSnapshot,
  NavTab,
} from './types';
import { CLUSTER_CONFIG } from './utils/formatters';

const SNAPSHOT_CACHE_KEY = 'mh_dashboard_snapshot_v3';

const AlertsPage = lazy(() =>
  import('./components/AlertsPage').then((m) => ({ default: m.AlertsPage }))
);
const CustomersPage = lazy(() =>
  import('./components/CustomersPage').then((m) => ({ default: m.CustomersPage }))
);
const GuestDetailModal = lazy(() =>
  import('./components/GuestDetailModal').then((m) => ({ default: m.GuestDetailModal }))
);
const GuestGroupsStudioPage = lazy(() =>
  import('./components/GuestGroupsStudioPage').then((m) => ({ default: m.GuestGroupsStudioPage }))
);
const HistoryPage = lazy(() =>
  import('./components/HistoryPage').then((m) => ({ default: m.HistoryPage }))
);
const SegmentationPage = lazy(() =>
  import('./components/SegmentationPage').then((m) => ({ default: m.SegmentationPage }))
);
const SimulatedSmsModal = lazy(() =>
  import('./components/SimulatedSmsModal').then((m) => ({ default: m.SimulatedSmsModal }))
);

function readCachedSnapshot(): DashboardSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    if (
      parsed?.metrics &&
      Array.isArray(parsed?.customers) &&
      Array.isArray(parsed?.cluster_profiles)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(data: DashboardSnapshot) {
  try {
    sessionStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

function TabLoadingFallback() {
  return (
    <div
      className="mh-skeleton-grid tab-animate"
      aria-busy="true"
      aria-label="Loading workspace section"
    >
      <div className="mh-skeleton-card" />
      <div className="mh-skeleton-card" />
    </div>
  );
}

export default function App() {
  const [initialCache] = useState<DashboardSnapshot | null>(() => readCachedSnapshot());
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialCache);
  const [loading, setLoading] = useState<boolean>(initialCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedClusterId, setSelectedClusterId] = useState<number>(0);

  const [inspectedCustomer, setInspectedCustomer] = useState<CustomerRecord | null>(null);

  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [dispatchedCampaign, setDispatchedCampaign] = useState<CampaignRecord | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const fetchSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getDashboard();
      if (!data?.metrics) {
        throw new Error('Dashboard metrics unavailable.');
      }
      setSnapshot(data);
      writeCachedSnapshot(data);
      setLoadError(null);
      setInspectedCustomer((prev) => {
        if (!prev) return null;
        return data.customers.find((c) => c.customer_id === prev.customer_id) || null;
      });
    } catch (err) {
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(initialCache !== null);
    const interval = setInterval(() => {
      if (!document.hidden) {
        void fetchSnapshot(true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchSnapshot, initialCache]);

  const dispatchSmsCampaign = useCallback(
    async (payload: {
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
    }) => {
      setSmsModalOpen(true);
      setIsSendingSms(true);
      setDispatchedCampaign(null);
      setSmsError(null);

      try {
        const minAnimDelay = new Promise((resolve) => setTimeout(resolve, 900));
        const [result] = await Promise.all([api.sendSmsCampaign(payload), minAnimDelay]);
        if (result?.snapshot?.metrics) {
          setSnapshot(result.snapshot);
          writeCachedSnapshot(result.snapshot);
        }
        setDispatchedCampaign(result.campaign);
        showToast(
          `SMS sent to ${result.campaign.recipient_count} guest(s) (${result.campaign.delivered_count} delivered).`
        );
      } catch (err) {
        setSmsError(err instanceof Error ? err.message : 'SMS dispatch failed.');
      } finally {
        setIsSendingSms(false);
      }
    },
    [showToast]
  );

  const handleMessageGroup = useCallback((cid: number) => {
    setSelectedClusterId(cid);
    setActiveTab('segments');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSaveCustomer = useCallback(
    async (payload: Partial<CustomerRecord> & { customer_name: string; contact_no: string }) => {
      const res = await api.upsertCustomer(payload);
      if (res?.snapshot?.metrics) {
        setSnapshot(res.snapshot);
        writeCachedSnapshot(res.snapshot);
      }
      setInspectedCustomer((prev) =>
        prev && prev.customer_id === res.customer.customer_id ? res.customer : prev
      );
      showToast(
        `Saved ${res.customer.customer_name} (${res.customer.cluster_name}) · Avg ₹${Math.round(
          res.customer.avg_spend_per_visit_inr
        )}/visit.`
      );
    },
    [showToast]
  );

  const handleBulkSendAlerts = useCallback(
    (guests: CustomerRecord[]) => {
      if (guests.length === 0) return;
      void dispatchSmsCampaign({
        campaign_name: `Guest Follow-Up Messages (${guests.length} Guests)`,
        campaign_type: 'bulk_alert',
        cluster_id: null,
        cluster_name: 'High Alert Guests',
        message_content:
          "Greetings from Mother's Hut!\nHi {customer_name}, Tailored follow-up message per guest group.",
        language: 'en',
        recipient_ids: guests.map((g) => g.customer_id),
      });
    },
    [dispatchSmsCampaign]
  );

  const isClusterThemeTab = activeTab === 'segments';
  const themeClusterId = isClusterThemeTab ? selectedClusterId : undefined;

  return (
    <div
      className="app-shell"
      data-cluster={themeClusterId !== undefined ? String(themeClusterId) : undefined}
    >
      {loading && !snapshot ? (
        <main className="main-container flex-1 w-full space-y-5">
          <div className="surface-card p-6 flex items-center gap-3">
            <Loader2 size={22} className="animate-spin shrink-0" style={{ color: 'var(--brand)' }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-dark)' }}>
                Loading Mother&apos;s Hut Portal
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Loading guest directory, dining groups, and live insights...
              </p>
            </div>
          </div>
          <div className="mh-skeleton-grid" aria-busy="true" aria-label="Loading dashboard">
            <div className="mh-skeleton-card" />
            <div className="mh-skeleton-card" />
            <div className="mh-skeleton-card" />
            <div className="mh-skeleton-card" />
          </div>
        </main>
      ) : loadError && !snapshot ? (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="surface-card p-8 text-center max-w-md w-full space-y-3">
            <div className="text-base font-semibold text-red-dark">Failed to Connect to Server</div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {loadError}
            </p>
            <button type="button" className="btn btn-brand btn-sm" onClick={() => fetchSnapshot(false)}>
              <RefreshCw size={14} /> Retry Connection
            </button>
          </div>
        </div>
      ) : snapshot && snapshot.metrics ? (
        <>
          <Navbar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            urgentBirthdaysCount={0}
            highAlertsCount={snapshot.metrics.high_alerts_remaining}
            historyCount={snapshot.metrics.total_campaigns}
          />

          <main className="main-container flex-1 w-full">
            {activeTab === 'overview' && (
              <OverviewPage
                snapshot={snapshot}
                onNavigate={(tab) => {
                  setActiveTab(tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onSelectGroup={handleMessageGroup}
              />
            )}

            <Suspense fallback={<TabLoadingFallback />}>
              {activeTab === 'segments' && (
                <GuestGroupsStudioPage
                  snapshot={snapshot}
                  selectedClusterId={selectedClusterId}
                  onSelectClusterId={setSelectedClusterId}
                  onLaunchSimulatedCampaign={(payload) => void dispatchSmsCampaign(payload)}
                />
              )}

              {activeTab === 'segmentation' && (
                <SegmentationPage snapshot={snapshot} onMessageGroup={handleMessageGroup} />
              )}

              {activeTab === 'customers' && (
                <CustomersPage
                  snapshot={snapshot}
                  onInspectCustomer={(c) => setInspectedCustomer(c)}
                />
              )}

              {activeTab === 'alerts' && (
                <AlertsPage
                  snapshot={snapshot}
                  onOpenGuestModal={(c) => setInspectedCustomer(c)}
                  onBulkSendAlerts={handleBulkSendAlerts}
                />
              )}

              {activeTab === 'history' && <HistoryPage snapshot={snapshot} />}
            </Suspense>
          </main>

          <footer className="app-footer">
            Mother&apos;s Hut Guest Portal • Guest Groups, Customer Alerts &amp; Messaging Studio
          </footer>
        </>
      ) : null}

      {inspectedCustomer && (
        <Suspense fallback={null}>
          <GuestDetailModal
            customer={inspectedCustomer}
            allCustomers={snapshot?.customers || []}
            isSent={
              inspectedCustomer
                ? snapshot?.contacted_alert_ids.includes(inspectedCustomer.customer_id) ?? false
                : false
            }
            onClose={() => setInspectedCustomer(null)}
            onSaveCustomer={handleSaveCustomer}
            onSendSimulatedSms={({ customer, message, language }) => {
              const cfg = CLUSTER_CONFIG[customer.cluster_id];
              setInspectedCustomer(null);
              void dispatchSmsCampaign({
                campaign_name: `Guest Follow-Up — ${customer.customer_name}`,
                campaign_type: 'alert',
                cluster_id: customer.cluster_id,
                cluster_name: cfg?.name || customer.cluster_name,
                message_content: message,
                language,
                recipient_ids: [customer.customer_id],
              });
            }}
          />
        </Suspense>
      )}

      {smsModalOpen && (
        <Suspense fallback={null}>
          <SimulatedSmsModal
            isOpen={smsModalOpen}
            isSimulating={isSendingSms}
            campaign={dispatchedCampaign}
            errorMessage={smsError}
            onClose={() => {
              setSmsModalOpen(false);
              setDispatchedCampaign(null);
              setSmsError(null);
            }}
          />
        </Suspense>
      )}

      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}