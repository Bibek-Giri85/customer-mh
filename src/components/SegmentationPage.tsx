import { useMemo } from 'react';
import type { DashboardSnapshot } from '../types';
import { formatINR } from '../utils/formatters';

interface SegmentationPageProps {
  snapshot: DashboardSnapshot;
  onMessageGroup: (cid: number) => void;
}

export function SegmentationPage({ snapshot, onMessageGroup }: SegmentationPageProps) {
  const { cluster_profiles, customers } = snapshot;

  const avgIntervalByCluster = useMemo(() => {
    const map: Record<number, number> = {};
    for (const prof of cluster_profiles) {
      const members = customers.filter(
        (c) => c.cluster_id === prof.cluster_id && c.expected_visit_gap > 0
      );
      if (members.length === 0) {
        map[prof.cluster_id] = 0;
      } else {
        const sum = members.reduce((acc, m) => acc + m.expected_visit_gap, 0);
        map[prof.cluster_id] = Math.round(sum / members.length);
      }
    }
    return map;
  }, [cluster_profiles, customers]);

  return (
    <div className="tab-animate">
      <div className="hero-row">
        <div>
          <h1>Group Profiles</h1>
          <p className="hero-subtitle">
            Visit frequency, average spend, visit timing, top food categories, and priority alerts across all 4 guest groups.
          </p>
        </div>
      </div>

      <div className="profiles-grid">
        {cluster_profiles.map((s) => {
          const avgGap = avgIntervalByCluster[s.cluster_id] || 0;
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
                {s.cluster_name} average <strong>{formatINR(s.avg_total_spend_inr)}</strong> total
                spend ({formatINR(s.avg_spend_per_visit_inr)} per visit), visit{' '}
                <strong>{s.avg_visits} times</strong>, and primarily order{' '}
                <strong>{s.top_food_category}</strong> during{' '}
                <strong>{s.preferred_meal_time}</strong>.
              </p>

              <div className="profile-tiles-grid">
                <div className="stat-tile">
                  <span className="tile-label">Avg Visits</span>
                  <strong className="tile-val">{s.avg_visits}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Avg Party Size</span>
                  <strong className="tile-val">{s.avg_group_size}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Visit Interval</span>
                  <strong className="tile-val">
                    {avgGap > 0 ? `${avgGap}d` : 'Single Visit'}
                  </strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Avg Total Spend</span>
                  <strong className="tile-val">{formatINR(s.avg_total_spend_inr)}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Spend / Visit</span>
                  <strong className="tile-val">{formatINR(s.avg_spend_per_visit_inr)}</strong>
                </div>
                <div className="stat-tile">
                  <span className="tile-label">Top Food</span>
                  <strong className="tile-val text-sm">{s.top_food_category}</strong>
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