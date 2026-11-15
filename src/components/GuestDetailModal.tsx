import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import type { CustomerRecord } from '../types';
import { formatINR, formatPhone, getInitials, getRealisticOffer } from '../utils/formatters';
import {
  buildPlainEnglishReason,
  buildStaffHospitalityTip,
  CLUSTER_COLORS,
} from '../utils/guestInsights';
import { HighlightedMessage } from './MessageHighlighter';

interface GuestDetailModalProps {
  customer: CustomerRecord | null;
  allCustomers: CustomerRecord[];
  isSent: boolean;
  onClose: () => void;
  onSaveCustomer: (
    payload: Partial<CustomerRecord> & { customer_name: string; contact_no: string }
  ) => Promise<void>;
  onSendSimulatedSms: (payload: {
    customer: CustomerRecord;
    message: string;
    language: 'en' | 'bn';
    coupon: string | null;
  }) => void;
}

export function GuestDetailModal({
  customer,
  allCustomers,
  isSent,
  onClose,
  onSaveCustomer,
  onSendSimulatedSms,
}: GuestDetailModalProps) {
  const [modalLang, setModalLang] = useState<'en' | 'bn'>('en');
  const [isEditing, setIsEditing] = useState(false);
  const [customText, setCustomText] = useState('');

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVisits, setEditVisits] = useState('1');
  const [editTotalSpend, setEditTotalSpend] = useState('0');
  const [editDish, setEditDish] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setModalLang('en');
    setIsEditing(false);
    setCustomText('');
    setIsEditingProfile(false);
    if (customer) {
      setEditName(customer.customer_name);
      setEditPhone(customer.contact_no);
      setEditVisits(String(customer.total_visits));
      setEditTotalSpend(String(customer.total_spend_inr));
      setEditDish(customer.most_ordered_dish || '');
    }
  }, [customer]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && customer) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [customer, onClose]);

  const insights = useMemo(() => {
    if (!customer) return null;
    const pool = allCustomers.length > 0 ? allCustomers : [customer];
    return {
      reason: buildPlainEnglishReason(customer, pool),
      staffTip: buildStaffHospitalityTip(customer),
    };
  }, [customer, allCustomers]);

  if (!customer || !insights) return null;

  const isAlert = customer.churn_alert_flag === 'HIGH_PRIORITY_ALERT';
  const offer = getRealisticOffer(customer);
  const activeMessage = customText || (modalLang === 'bn' ? offer.messageBn : offer.messageEn);
  const clusterPalette = CLUSTER_COLORS[customer.cluster_id] || CLUSTER_COLORS[0];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onSaveCustomer({
        ...customer,
        customer_id: customer.customer_id,
        customer_name: editName.trim() || customer.customer_name,
        contact_no: editPhone.trim() || customer.contact_no,
        total_visits: Math.max(1, Number(editVisits) || 1),
        total_spend_inr: Math.max(0, Number(editTotalSpend) || 0),
        most_ordered_dish: editDish.trim() || null,
      });
      setIsEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <button type="button" className="modal-close" aria-label="Close Profile" onClick={onClose}>
          &times;
        </button>

        <div className="modal-header">
          <div className="modal-avatar" style={{ backgroundColor: clusterPalette.main }}>
            {getInitials(customer.customer_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="modal-title-line">
              <h2>{customer.customer_name}</h2>
              <span className={`alert-status-pill ${isSent || !isAlert ? 'sent-green' : ''}`}>
                {isSent ? '✓ SENT' : isAlert ? 'HIGH ALERT' : 'ACTIVE GUEST'}
              </span>
              <span
                className="cluster-tag-pill font-semibold"
                style={{
                  backgroundColor: clusterPalette.soft,
                  color: clusterPalette.main,
                  border: `1px solid ${clusterPalette.border}`,
                }}
              >
                {customer.cluster_name}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '4px 11px', fontSize: '0.72rem' }}
                onClick={() => setIsEditingProfile((v) => !v)}
              >
                {isEditingProfile ? 'Cancel Edit' : '✎ Edit Details'}
              </button>
            </div>
            <div className="modal-meta-line">
              <span>{customer.customer_id}</span>
              <span>•</span>
              <span className="modal-phone-text">{formatPhone(customer.contact_no)}</span>
              <span>•</span>
              <span>{customer.preferred_order_channel || 'Dine-In'}</span>
              <span>•</span>
              <span>First Visit: {customer.first_visit_date}</span>
              <span>•</span>
              <span>Last Visit: {customer.last_visit_date}</span>
            </div>
          </div>
        </div>

        {isEditingProfile && (
          <form onSubmit={handleSaveProfile} className="guest-edit-form">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <strong style={{ color: 'var(--text-dark)' }}>Update Guest Details</strong>
              <span style={{ color: 'var(--text-muted)' }}>
                Auto Avg / Visit Preview:{' '}
                <strong style={{ color: 'var(--text-dark)' }}>
                  {formatINR(
                    Math.round(
                      Math.max(0, Number(editTotalSpend) || 0) /
                        Math.max(1, Number(editVisits) || 1)
                    )
                  )}
                </strong>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div>
                <label className="guest-field-label">Name</label>
                <input
                  required
                  type="text"
                  className="field-input w-full"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="guest-field-label">Contact</label>
                <input
                  required
                  type="text"
                  className="field-input w-full"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="guest-field-label">Total Visits</label>
                <input
                  type="number"
                  min={1}
                  className="field-input w-full"
                  value={editVisits}
                  onChange={(e) => setEditVisits(e.target.value)}
                />
              </div>
              <div>
                <label className="guest-field-label">Total Spend (₹)</label>
                <input
                  type="number"
                  min={0}
                  className="field-input w-full"
                  value={editTotalSpend}
                  onChange={(e) => setEditTotalSpend(e.target.value)}
                />
              </div>
              <div>
                <label className="guest-field-label">Favourite Dish</label>
                <input
                  type="text"
                  className="field-input w-full"
                  value={editDish}
                  onChange={(e) => setEditDish(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setIsEditingProfile(false)}
              >
                Cancel
              </button>
              <button type="submit" disabled={savingProfile} className="btn btn-brand btn-sm">
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        <div className="modal-split-body">
          <div className="space-y-3">
            <div className="modal-stats-grid" style={{ marginBottom: 0 }}>
              <div className="stat-tile">
                <span className="tile-label">Total Visits</span>
                <strong className="tile-val">{customer.total_visits}</strong>
                <small className="tile-sub">Last: {customer.days_since_last_visit}d ago</small>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Avg / Visit</span>
                <strong className="tile-val">{formatINR(customer.avg_spend_per_visit_inr)}</strong>
                <small className="tile-sub">Party avg: {customer.avg_group_size}</small>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Total Spend</span>
                <strong className="tile-val">{formatINR(customer.total_spend_inr)}</strong>
                <small className="tile-sub">
                  Interval:{' '}
                  {customer.expected_visit_gap > 0
                    ? `Every ${customer.expected_visit_gap}d`
                    : 'Single Visit'}
                </small>
              </div>
            </div>

            <div className="modal-sub-panel">
              <h3>Dining Summary</h3>
              <div className="guest-pref-list">
                <div className="guest-pref-row">
                  <span>Favourite Dish</span>
                  <strong>{customer.most_ordered_dish || 'Not recorded yet'}</strong>
                </div>
                <div className="guest-pref-row">
                  <span>Top Food Category</span>
                  <strong>{customer.top_food_category || 'General'}</strong>
                </div>
                <div className="guest-pref-row">
                  <span>Preferred Time</span>
                  <strong>
                    {customer.preferred_meal_time} • {customer.preferred_day_type}
                  </strong>
                </div>
                <div className="guest-pref-row">
                  <span>Service Mode</span>
                  <strong>{customer.preferred_order_channel || 'Dine-In'}</strong>
                </div>
              </div>
            </div>

            <div className="guest-reason-box">
              <Sparkles
                size={15}
                className="shrink-0 mt-0.5"
                style={{ color: clusterPalette.main }}
              />
              <div>
                <strong>Why this group: </strong>
                <span>{insights.reason}</span>
              </div>
            </div>
          </div>

          <div className="modal-right-col">
            <div className="staff-tip-box">
              <div className="flex items-start gap-2.5">
                <span className="staff-tip-icon">
                  <Lightbulb size={15} />
                </span>
                <div>
                  <span className="staff-tip-eyebrow">STAFF HOSPITALITY TIP</span>
                  <p
                    className="text-xs mt-0.5 leading-relaxed"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    {insights.staffTip}
                  </p>
                </div>
              </div>
            </div>

            <div className="recommended-offer-box">
              <div className="rec-top-row">
                <span className="rec-eyebrow">RECOMMENDED INVITATION</span>
              </div>
              <h3>{offer.offerTitle}</h3>
              <p>{offer.reason}</p>
            </div>

            <div className="modal-send-panel">
              <div className="modal-send-top">
                <div>
                  <h3>Send SMS</h3>
                  <span className="send-to-label">
                    To: {customer.customer_name} ({formatPhone(customer.contact_no)})
                  </span>
                </div>
                <div className="lang-pill-group">
                  <button
                    type="button"
                    className={`lang-btn modal-lang-btn ${modalLang === 'en' ? 'active' : ''}`}
                    onClick={() => {
                      setModalLang('en');
                      setCustomText('');
                      setIsEditing(false);
                    }}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    className={`lang-btn modal-lang-btn ${modalLang === 'bn' ? 'active' : ''}`}
                    onClick={() => {
                      setModalLang('bn');
                      setCustomText('');
                      setIsEditing(false);
                    }}
                  >
                    বাংলা
                  </button>
                </div>
              </div>

              {isEditing ? (
                <textarea
                  className="custom-textarea"
                  rows={4}
                  value={activeMessage}
                  onChange={(e) => setCustomText(e.target.value)}
                />
              ) : (
                <div className="modal-message-preview">
                  <HighlightedMessage text={activeMessage} />
                </div>
              )}

              <div className="modal-send-bottom">
                <span className="sent-status-note">
                  {isSent ? '✓ SMS sent' : 'Ready to send'}
                </span>
                <div className="modal-send-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      if (!isEditing) {
                        setCustomText(activeMessage);
                        setIsEditing(true);
                      } else {
                        setIsEditing(false);
                      }
                    }}
                  >
                    {isEditing ? '✓ Done' : '✎ Edit Text'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-brand"
                    onClick={() =>
                      onSendSimulatedSms({
                        customer,
                        message: activeMessage,
                        language: modalLang,
                        coupon: null,
                      })
                    }
                  >
                    Send SMS
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}