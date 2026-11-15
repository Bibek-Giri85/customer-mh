import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search, Users } from 'lucide-react';
import type { CustomerRecord, DashboardSnapshot } from '../types';
import { formatINR, formatPhone } from '../utils/formatters';

interface CustomersPageProps {
  snapshot: DashboardSnapshot;
  onInspectCustomer: (c: CustomerRecord) => void;
}

const PAGE_SIZE = 50;

export function CustomersPage({ snapshot, onInspectCustomer }: CustomersPageProps) {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'tiles'>('list');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.customers.filter((c) => {
      if (clusterFilter !== 'all' && String(c.cluster_id) !== clusterFilter) return false;
      if (!q) return true;
      return `${c.customer_name} ${c.customer_id} ${c.contact_no} ${c.most_ordered_dish || ''} ${c.cluster_name}`
        .toLowerCase()
        .includes(q);
    });
  }, [snapshot.customers, search, clusterFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, clusterFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  return (
    <div className="tab-animate space-y-4">
      <div className="hero-row" style={{ marginBottom: 4 }}>
        <div>
          <h1>Guest Directory</h1>
          <p className="hero-subtitle">
            Complete guest profiles with spending, favourite dishes, visit timing, and customer groups from your orders database.
          </p>
        </div>

        <div className="surface-card px-3.5 py-2 flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-body)' }}>
          <Users size={13} style={{ color: 'var(--brand)' }} />
          <span>{snapshot.customers.length.toLocaleString()} Active Guests</span>
        </div>
      </div>

      <div className="surface-card alert-toolbar">
        <div className="alert-filter-bar">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="field-input w-full"
              style={{ paddingLeft: 30 }}
              placeholder="Search name, phone, ID, dish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="field-input"
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
          >
            <option value="all">All Groups ({snapshot.customers.length.toLocaleString()})</option>
            {snapshot.cluster_profiles.map((p) => (
              <option key={p.cluster_id} value={String(p.cluster_id)}>
                {p.cluster_name} ({p.customer_count.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        <div className="alert-right-controls">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: 'var(--text-dark)' }}>{filtered.length.toLocaleString()}</strong> guests
          </span>

          <div className="view-toggle-group" role="group" aria-label="View format">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'tiles' ? 'active' : ''}`}
              onClick={() => setViewMode('tiles')}
            >
              <LayoutGrid size={13} />
              Tiles
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={13} />
              List
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#fcf5e8] border-b border-[#e5cfb0] text-[#5b2e33] font-semibold whitespace-nowrap">
                  <th className="py-3 px-3.5">Customer ID</th>
                  <th className="py-3 px-3">Name</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Visits</th>
                  <th className="py-3 px-3">Total Spend</th>
                  <th className="py-3 px-3">Avg / Visit</th>
                  <th className="py-3 px-3">Fav Dish</th>
                  <th className="py-3 px-3">Days Since Visit</th>
                  <th className="py-3 px-3">Visit Interval</th>
                  <th className="py-3 px-3.5">Customer Group</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2e5d2]">
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                      No guests match your filter.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((c) => (
                    <tr
                      key={c.customer_id}
                      className="hover:bg-[#faf0e2]/70 cursor-pointer whitespace-nowrap transition-colors"
                      onClick={() => onInspectCustomer(c)}
                    >
                      <td className="py-2.5 px-3.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                        {c.customer_id}
                      </td>
                      <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--text-dark)' }}>
                        {c.customer_name}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--brand)' }}>
                        {formatPhone(c.contact_no)}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-body)' }}>
                        {c.total_visits}
                      </td>
                      <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--text-dark)' }}>
                        {formatINR(c.total_spend_inr)}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-body)' }}>
                        {formatINR(c.avg_spend_per_visit_inr)}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-dark)' }}>
                        {c.most_ordered_dish || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-body)' }}>
                        {c.days_since_last_visit}d ago
                      </td>
                      <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-body)' }}>
                        {c.expected_visit_gap > 0 ? `Every ${c.expected_visit_gap}d` : 'Single Visit'}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="cluster-tag-pill">{c.cluster_name}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="alert-cards-grid">
          {pageItems.length === 0 ? (
            <div
              className="surface-card"
              style={{ padding: 28, gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              No guests match your filter.
            </div>
          ) : (
            pageItems.map((c) => (
              <div
                key={c.customer_id}
                role="button"
                tabIndex={0}
                className="alert-customer-card"
                onClick={() => onInspectCustomer(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectCustomer(c);
                  }
                }}
              >
                <div className="ac-top">
                  <div className="ac-identity">
                    <div className="ac-name">{c.customer_name}</div>
                    <div className="ac-phone">{formatPhone(c.contact_no)}</div>
                  </div>
                  <span className="cluster-tag-pill shrink-0">{c.cluster_name}</span>
                </div>

                <div className="ac-offer-preview flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    ID: <strong>{c.customer_id}</strong>
                  </span>
                  <span>
                    Visits: <strong>{c.total_visits}</strong>
                  </span>
                  <span>
                    Interval:{' '}
                    <strong>
                      {c.expected_visit_gap > 0 ? `${c.expected_visit_gap}d` : '1st Visit'}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="stat-tile">
                    <span className="tile-label">Total Spend</span>
                    <strong className="tile-val">{formatINR(c.total_spend_inr)}</strong>
                  </div>
                  <div className="stat-tile">
                    <span className="tile-label">Avg / Visit</span>
                    <strong className="tile-val">{formatINR(c.avg_spend_per_visit_inr)}</strong>
                  </div>
                </div>

                <div className="ac-bottom">
                  <span>
                    Fav Dish: <strong>{c.most_ordered_dish || '—'}</strong>
                  </span>
                  <span>
                    Last Visit: <strong>{c.days_since_last_visit}d ago</strong>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="surface-card px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Page <strong style={{ color: 'var(--text-dark)' }}>{safePage}</strong> of{' '}
            <strong style={{ color: 'var(--text-dark)' }}>{totalPages}</strong> ({filtered.length.toLocaleString()} guests)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}