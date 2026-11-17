import type { DashboardSnapshot } from '../types';
import { formatINR } from '../utils/formatters';

interface SegmentationPageProps {
  snapshot: DashboardSnapshot;
  onMessageGroup: (cid: number) => void;
}

export function SegmentationPage({ snapshot, onMessageGroup }: SegmentationPageProps) {
  const { cluster_profiles } = snapshot;

  return (
    <div className="tab-animate">
      <div className="hero-row" style={{ marginBottom: 16 }}>
        <div>
          <h1>Group Profiles</h1>
          <p className="hero-subtitle">
            Visit frequency, average spend, dining timing, and priority alerts across all 4 guest groups.
          </p>
        </div>
      </div>

      <div className="profiles-grid">
        {cluster_profiles.map((s) => {
          const visitLabel = s.avg_visits === 1 ? 'time' : 'times';
          return (
            <div key={s.cluster_id} className="surface-card profile-card" data-cluster={s.cluster_id}>
              <div className="profile-card-top">
                <div>
                  <span className="profile-cluster-label">GROUP {s.cluster_id + 1} PROFILE</span>
                  <h2>{s.cluster_name}</h2>
                  <p className="profile-subtitle">{s.subtitle}</p>
                </div>
                <div className="group-size-badge">
                  <span>Group Size</span>
                  <strong>{s.customer_count.toLocaleString()}</strong>
                </div>
              </div>

              <p className="profile-body-desc">
                Avg <strong>{formatINR(s.avg_total_spend_inr)}</strong> total •{' '}
                <strong>{formatINR(s.avg_spend_per_visit_inr)}</strong>/visit •{' '}
                <strong>
                  {s.avg_visits} {visitLabel}
                </strong>{' '}
                • Mostly <strong>{s.preferred_meal_time}</strong>
              </p>

              <div className="profile-tiles-grid">
                <div className="stat-tile">
                  <span className="tile-label">Avg Visits</span>
                  <strong className="tile-val">{s.avg_visits}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Avg Total Spend</span>
                  <strong className="tile-val">{formatINR(s.avg_total_spend_inr)}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Spend / Visit</span>
                  <strong className="tile-val">{formatINR(s.avg_spend_per_visit_inr)}</strong>
                </div>
              </div>

              <div className="profile-footer-bar">
                <span>
                  High Alerts: <strong className="text-red-dark">{s.high_alerts_count}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm jump-cluster-btn"
                  onClick={() => onMessageGroup(s.cluster_id)}
                >
                  Message This Group →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}