import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  IndianRupee,
  Lock,
  MessageSquare,
  ShoppingBag,
  Unlock,
} from 'lucide-react';
import type { DashboardSnapshot, NavTab } from '../types';
import { formatINR, REVENUE_PASSWORD } from '../utils/formatters';

interface OverviewPageProps {
  snapshot: DashboardSnapshot;
  onNavigate: (tab: NavTab) => void;
  onSelectGroup: (cid: number) => void;
  onSyncNow?: () => Promise<void> | void;
}

const REVENUE_UNLOCK_SECONDS = 10;

const CLUSTER_COLORS: Record<number, string> = {
  0: '#ab6446',
  1: '#0284c7',
  2: '#d97706',
  3: '#0d9488',
};

const SHORT_NAMES: Record<number, string> = {
  0: 'Frequent',
  1: 'Premium',
  2: 'Family',
  3: 'Occasional',
};

function formatSyncTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dayFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  if (dayFmt.format(d) === dayFmt.format(new Date())) {
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function OverviewPage({
  snapshot,
  onNavigate,
  onSelectGroup,
  onSyncNow,
}: OverviewPageProps) {
  const { metrics, cluster_profiles } = snapshot;

  const [revenueUnlocked, setRevenueUnlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [hoveredCid, setHoveredCid] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!revenueUnlocked) return;
    if (secondsLeft <= 0) {
      setRevenueUnlocked(false);
      return;
    }
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [revenueUnlocked, secondsLeft]);

  const handleToggleRevenue = () => {
    if (revenueUnlocked) {
      setRevenueUnlocked(false);
      setSecondsLeft(0);
    } else {
      setPinInput('');
      setPinError('');
      setShowPinModal(true);
    }
  };

  const handlePillClick = async () => {
    if (!onSyncNow || isChecking) return;
    setIsChecking(true);
    try {
      await onSyncNow();
    } finally {
      setIsChecking(false);
    }
  };

  const pieSlices = useMemo(() => {
    const sorted = [...cluster_profiles].sort((a, b) => a.cluster_id - b.cluster_id);
    const total = Math.max(
      1,
      sorted.reduce((sum, p) => sum + p.customer_count, 0)
    );
    const cx = 120;
    const cy = 120;
    const R = 102;
    const r = 62;
    let currentAngle = -Math.PI / 2;

    return sorted.map((p) => {
      const fraction = p.customer_count / total;
      const angleSpan = Math.max(0.02, fraction * Math.PI * 2);
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;
      currentAngle = endAngle;

      const x1 = cx + R * Math.cos(startAngle);
      const y1 = cy + R * Math.sin(startAngle);
      const x2 = cx + R * Math.cos(endAngle);
      const y2 = cy + R * Math.sin(endAngle);

      const x3 = cx + r * Math.cos(endAngle);
      const y3 = cy + r * Math.sin(endAngle);
      const x4 = cx + r * Math.cos(startAngle);
      const y4 = cy + r * Math.sin(startAngle);

      const largeArc = angleSpan > Math.PI ? 1 : 0;
      const path = [
        `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        `A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
        `A ${r} ${r} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
        'Z',
      ].join(' ');

      const midAngle = (startAngle + endAngle) / 2;
      const labelRadius = (R + r) / 2;
      const labelX = cx + labelRadius * Math.cos(midAngle);
      const labelY = cy + labelRadius * Math.sin(midAngle);

      return {
        ...p,
        color: CLUSTER_COLORS[p.cluster_id] || '#ab6446',
        shortName: SHORT_NAMES[p.cluster_id] || p.cluster_name,
        path,
        labelX,
        labelY,
      };
    });
  }, [cluster_profiles]);

  const activeSlice = useMemo(
    () => pieSlices.find((s) => s.cluster_id === hoveredCid) || null,
    [pieSlices, hoveredCid]
  );

  const hasSyncError = Boolean(metrics.last_sync_error);
  const formattedTime = formatSyncTime(metrics.last_sync_at);

  return (
    <div className="tab-animate space-y-4">
      <div className="hero-row" style={{ marginBottom: 24 }}>
        <div className="min-w-0 flex-1">
          <h1>Restaurant Overview</h1>
          <p className="hero-subtitle">
            Live analytics across protected revenue, total orders, overdue guest alerts, delivered messages, and guest group distribution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handlePillClick()}
          disabled={isChecking}
          className={`live-sync-pill text-left cursor-pointer ${hasSyncError ? 'is-error' : ''}`}
          role="status"
          aria-live="polite"
          title={
            hasSyncError
              ? `Sync error: ${metrics.last_sync_error} (click to retry)`
              : 'Auto-updates when new orders arrive · Click to check now'
          }
        >
          <span className="live-dot-wrap" aria-hidden="true">
            {!hasSyncError && <span className="live-dot-ping" />}
            <span className={`live-dot-core ${hasSyncError ? 'is-error' : ''}`} />
          </span>
          <div className="live-sync-copy">
            <span className={`live-sync-title ${hasSyncError ? 'is-error' : ''}`}>
              {isChecking
                ? 'Checking Orders...'
                : hasSyncError
                ? 'Sync Error · Click to Retry'
                : 'Live Data Sync'}
            </span>
            <span className="live-sync-sub">
              {hasSyncError
                ? formattedTime
                  ? `Could not fetch · Last: ${formattedTime}`
                  : 'Could not fetch from database'
                : formattedTime
                ? `Last updated: ${formattedTime}`
                : 'Syncing...'}
            </span>
          </div>
        </button>
      </div>

      <div className="overview-hub-grid">
        <button
          type="button"
          className="overview-stat-card accent-red overview-card-tl"
          onClick={handleToggleRevenue}
          title={revenueUnlocked ? 'Click to hide Total Revenue' : 'Click to unlock Total Revenue'}
        >
          <div className="overview-card-top">
            <span className="kpi-label kpi-label-red">
              TOTAL REVENUE {revenueUnlocked ? <Unlock size={11} /> : <Lock size={11} />}
            </span>
            <span
              className="overview-icon-box"
              style={{
                background: 'var(--red-alert-soft)',
                color: 'var(--red-alert-dark)',
                border: '1px solid var(--red-alert-border)',
              }}
            >
              <IndianRupee size={19} />
            </span>
          </div>
          <div className="overview-card-val text-red-dark">
            {revenueUnlocked ? formatINR(metrics.total_revenue_inr) : '** ₹'}
          </div>
          <div className="overview-card-sub">
            <span>
              {revenueUnlocked
                ? `Auto-hides in ${secondsLeft}s · Click to hide`
                : 'Protected · Click to unlock (Tester PIN: 2004)'}
            </span>
            <ArrowRight size={15} />
          </div>
        </button>

        <section
          className="overview-pie-hub"
          aria-label="Customer Group Share Pie Chart"
          onMouseLeave={() => setHoveredCid(null)}
        >
          <div className="w-full flex items-center justify-between gap-2">
            <span className="kpi-label" style={{ color: 'var(--brand)' }}>
              GUEST DISTRIBUTION
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {metrics.cluster_count} Groups
            </span>
          </div>

          <div className="overview-pie-stage">
            <svg
              viewBox="0 0 240 240"
              className="w-full h-full overflow-visible"
              role="img"
              aria-label="Interactive pie chart showing percentage occupied by each customer group"
            >
              {pieSlices.map((slice) => {
                const isHovered = hoveredCid === slice.cluster_id;
                const isDimmed = hoveredCid !== null && !isHovered;
                return (
                  <g
                    key={slice.cluster_id}
                    style={{
                      cursor: 'pointer',
                      transform: isHovered ? 'scale(1.065)' : 'scale(1)',
                      transformOrigin: '120px 120px',
                      opacity: isDimmed ? 0.52 : 1,
                      filter: isHovered
                        ? 'drop-shadow(0 6px 14px rgba(15, 23, 42, 0.18))'
                        : 'none',
                      transition:
                        'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease, filter 0.2s ease',
                    }}
                    onMouseEnter={() => setHoveredCid(slice.cluster_id)}
                    onFocus={() => setHoveredCid(slice.cluster_id)}
                    onClick={() => onSelectGroup(slice.cluster_id)}
                  >
                    <path
                      d={slice.path}
                      fill={slice.color}
                      stroke="#ffffff"
                      strokeWidth={2.5}
                    />
                    {slice.customer_share_pct >= 8 && (
                      <text
                        x={slice.labelX}
                        y={slice.labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#ffffff"
                        fontSize="11.5"
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        {Math.round(slice.customer_share_pct)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            <div className="overview-pie-center-readout">
              {activeSlice ? (
                <>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mb-1"
                    style={{ background: activeSlice.color }}
                  />
                  <span
                    className="text-2xl font-semibold leading-none"
                    style={{ color: activeSlice.color }}
                  >
                    {activeSlice.customer_share_pct}%
                  </span>
                  <span
                    className="text-[11px] font-semibold mt-1.5 leading-tight"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    {activeSlice.cluster_name}
                  </span>
                  <span className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {activeSlice.customer_count.toLocaleString()} guests
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    Total Guests
                  </span>
                  <span
                    className="text-2xl font-semibold leading-tight mt-0.5"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    {metrics.total_customers.toLocaleString()}
                  </span>
                  <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Hover a slice
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="overview-pie-legend">
            {pieSlices.map((slice) => {
              const isActive = hoveredCid === slice.cluster_id;
              return (
                <button
                  key={slice.cluster_id}
                  type="button"
                  className={`overview-legend-pill ${isActive ? 'is-active' : ''}`}
                  style={{ '--pill-color': slice.color } as React.CSSProperties}
                  onMouseEnter={() => setHoveredCid(slice.cluster_id)}
                  onClick={() => onSelectGroup(slice.cluster_id)}
                  title={`Message ${slice.cluster_name} (${slice.customer_share_pct}%)`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: slice.color }}
                    />
                    <span className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>
                      {slice.shortName}
                    </span>
                  </span>
                  <strong style={{ color: slice.color }}>{slice.customer_share_pct}%</strong>
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          className="overview-stat-card accent-blue overview-card-tr"
          onClick={() => onNavigate('customers')}
        >
          <div className="overview-card-top">
            <span className="kpi-label">TOTAL ORDERS</span>
            <span
              className="overview-icon-box"
              style={{
                background: '#f0f9ff',
                color: 'var(--blue)',
                border: '1px solid #bae6fd',
              }}
            >
              <ShoppingBag size={19} />
            </span>
          </div>
          <div className="overview-card-val">{metrics.total_orders.toLocaleString()}</div>
          <div className="overview-card-sub">
            <span>{metrics.total_customers.toLocaleString()} active guests · View Directory</span>
            <ArrowRight size={15} />
          </div>
        </button>

        <button
          type="button"
          className="overview-stat-card accent-brand overview-card-bl"
          onClick={() => onNavigate('alerts')}
        >
          <div className="overview-card-top">
            <span className="kpi-label">HIGH ALERT GUESTS</span>
            <span
              className="overview-icon-box"
              style={{
                background: 'var(--brand-soft)',
                color: 'var(--brand)',
                border: '1px solid var(--brand-border)',
              }}
            >
              <AlertTriangle size={19} />
            </span>
          </div>
          <div className="overview-card-val" style={{ color: 'var(--brand)' }}>
            {metrics.high_alerts_remaining.toLocaleString()}
          </div>
          <div className="overview-card-sub">
            <span>Overdue guests needing follow-up</span>
            <ArrowRight size={15} />
          </div>
        </button>

        <button
          type="button"
          className="overview-stat-card accent-green overview-card-br"
          onClick={() => onNavigate('history')}
        >
          <div className="overview-card-top">
            <span className="kpi-label">MESSAGE DELIVERED</span>
            <span
              className="overview-icon-box"
              style={{
                background: 'var(--green-soft)',
                color: 'var(--green-dark)',
                border: '1px solid var(--green-border)',
              }}
            >
              <MessageSquare size={19} />
            </span>
          </div>
          <div className="overview-card-val text-green">
            {metrics.total_sms_delivered.toLocaleString()}
          </div>
          <div className="overview-card-sub">
            <span>View Sent History</span>
            <ArrowRight size={15} />
          </div>
        </button>
      </div>

      {showPinModal && (
        <div
          className="pin-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPinModal(false);
          }}
        >
          <form
            className="pin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (pinInput.trim() === REVENUE_PASSWORD) {
                setRevenueUnlocked(true);
                setSecondsLeft(REVENUE_UNLOCK_SECONDS);
                setShowPinModal(false);
              } else {
                setPinError('Incorrect password (use 2004)');
              }
            }}
          >
            <h3 className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-dark)' }}>
              Enter Password
            </h3>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Enter manager password to view revenue (auto-hides in 10s).
            </p>
            <div
              className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg mb-2.5"
              style={{
                background: 'var(--gold-soft)',
                color: 'var(--brand)',
                border: '1px solid var(--border)',
              }}
            >
              Tester Password: <strong>2004</strong>
            </div>
            <input
              type="password"
              autoFocus
              className="field-input w-full text-sm tracking-widest mb-1.5"
              placeholder="2004"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
            />
            <div className="text-[11px] text-red-600 min-h-4 mb-2">{pinError}</div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowPinModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-brand btn-sm">
                Unlock
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}