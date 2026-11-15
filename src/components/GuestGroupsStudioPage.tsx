import { useMemo, useState } from 'react';
import { Crown, Ticket, UserPlus, Users } from 'lucide-react';
import type { CustomerRecord, DashboardSnapshot } from '../types';
import {
  applyPlaceholders,
  CLUSTER_CONFIG,
  formatINR,
} from '../utils/formatters';
import { HighlightedMessage } from './MessageHighlighter';

interface GuestGroupsStudioPageProps {
  snapshot: DashboardSnapshot;
  selectedClusterId: number;
  onSelectClusterId: (cid: number) => void;
  onLaunchSimulatedCampaign: (payload: {
    campaign_name: string;
    campaign_type: 'cluster';
    cluster_id: number;
    cluster_name: string;
    message_content: string;
    language: 'en' | 'bn';
    recipient_ids: string[];
  }) => void;
}

const CLUSTER_ICONS: Record<number, typeof Ticket> = {
  0: Ticket,
  1: Crown,
  2: Users,
  3: UserPlus,
};

export function GuestGroupsStudioPage({
  snapshot,
  selectedClusterId,
  onSelectClusterId,
  onLaunchSimulatedCampaign,
}: GuestGroupsStudioPageProps) {
  const [selectedLang, setSelectedLang] = useState<'en' | 'bn'>('en');
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [customTemplateText, setCustomTemplateText] = useState('');

  const { cluster_profiles, customers, metrics } = snapshot;

  const clusterMembers = useMemo(
    () => customers.filter((c) => c.cluster_id === selectedClusterId),
    [customers, selectedClusterId]
  );

  const cfg = CLUSTER_CONFIG[selectedClusterId] || CLUSTER_CONFIG[0];
  const activeProfile = cluster_profiles.find((p) => p.cluster_id === selectedClusterId);
  const templates = cfg.templates[selectedLang];
  const activeTpl = templates[selectedTemplateIdx] || templates[0];
  const sampleGuest: CustomerRecord | undefined =
    clusterMembers[sampleIndex % Math.max(1, clusterMembers.length)];

  const rawTemplateText = isEditingTemplate ? customTemplateText : activeTpl.text;
  const renderedPreview = sampleGuest
    ? applyPlaceholders(rawTemplateText, sampleGuest, selectedLang)
    : rawTemplateText;

  const handleSelectCluster = (cid: number) => {
    onSelectClusterId(cid);
    setSelectedTemplateIdx(0);
    setSampleIndex(0);
    setIsEditingTemplate(false);
  };

  return (
    <div className="tab-animate">
      <div className="hero-row">
        <div>
          <h1>Guest Groups and Message</h1>
          <p className="hero-subtitle">
            Choose a dining group below, pick English or Bengali, select a tailored message, and send to the entire group.
          </p>
        </div>

        <div className="surface-card kpi-card">
          <div className="kpi-col">
            <span className="kpi-label">CUSTOMERS</span>
            <strong className="kpi-val">{metrics.total_customers.toLocaleString()}</strong>
          </div>
          <div className="kpi-divider" />
          <div className="kpi-col">
            <span className="kpi-label">GROUPS</span>
            <strong className="kpi-val">{metrics.cluster_count}</strong>
          </div>
          <div className="kpi-divider" />
          <div className="kpi-col">
            <span className="kpi-label">SENT</span>
            <strong className="kpi-val text-green">{metrics.total_sms_sent}</strong>
          </div>
          <div className="kpi-divider" />
          <div className="kpi-col">
            <span className="kpi-label">HIGH ALERTS</span>
            <strong className="kpi-val text-red-dark">{metrics.high_alerts_remaining}</strong>
          </div>
        </div>
      </div>

      {/* 4 Group Cards */}
      <div className="cluster-cards-grid">
        {cluster_profiles.map((prof) => {
          const cid = prof.cluster_id;
          const active = selectedClusterId === cid;
          const IconComp = CLUSTER_ICONS[cid] || Ticket;
          return (
            <button
              key={cid}
              type="button"
              className={`cluster-card ${active ? 'active' : ''}`}
              data-cluster={cid}
              onClick={() => handleSelectCluster(cid)}
            >
              <div className="cluster-icon-box">
                <IconComp size={19} />
              </div>
              <div className="min-w-0">
                <span className="cluster-tag">GROUP {cid + 1}</span>
                <div className="cluster-name truncate">{prof.cluster_name}</div>
                <div className="cluster-sub">
                  {prof.customer_count} guests · {formatINR(prof.avg_spend_per_visit_inr)} avg
                </div>
              </div>
              {active && <span className="active-badge">Active</span>}
            </button>
          );
        })}
      </div>

      <section className="surface-card studio-panel" data-cluster={selectedClusterId}>
        <div className="studio-top">
          <div>
            <span className="studio-eyebrow">PERSONALIZED CAMPAIGN STUDIO</span>
            <h2>Select a Message for {activeProfile?.cluster_name || cfg.name}</h2>
          </div>

          <div className="lang-bar">
            <span className="lang-label">Language:</span>
            <div className="lang-pill-group">
              <button
                type="button"
                className={`lang-btn ${selectedLang === 'en' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedLang('en');
                  setIsEditingTemplate(false);
                }}
              >
                English
              </button>
              <button
                type="button"
                className={`lang-btn ${selectedLang === 'bn' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedLang('bn');
                  setIsEditingTemplate(false);
                }}
              >
                বাংলা (Bengali)
              </button>
            </div>
          </div>
        </div>

        <div className="template-cards-grid">
          {templates.map((tpl, idx) => {
            const isSel = idx === selectedTemplateIdx;
            return (
              <button
                key={`${tpl.title}-${idx}`}
                type="button"
                className={`template-card ${isSel ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTemplateIdx(idx);
                  setIsEditingTemplate(false);
                }}
              >
                <div className="template-card-top">
                  <div className="template-badge-group">
                    <span className="template-badge">{tpl.badge}</span>
                  </div>
                  <span className="radio-circle">{isSel ? '✓' : ''}</span>
                </div>
                <h3>{tpl.title}</h3>
                <div className="template-card-note">{tpl.note}</div>
              </button>
            );
          })}
        </div>

        <div className="preview-box">
          <div className="preview-top">
            <div className="preview-doc-meta">
              <span className="doc-tag">
                Guest: <strong>{sampleGuest ? sampleGuest.customer_name : '—'}</strong>
              </span>
              <span className="doc-tag">
                Style: <strong>{activeTpl.badge}</strong>
              </span>
            </div>
            <div className="preview-btn-group">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSampleIndex((i) => i + 1)}
              >
                Next Sample Guest
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  if (!isEditingTemplate) {
                    setCustomTemplateText(activeTpl.text);
                    setIsEditingTemplate(true);
                  } else {
                    setIsEditingTemplate(false);
                  }
                }}
              >
                {isEditingTemplate ? '✓ Done' : '✎ Customize'}
              </button>
            </div>
          </div>

          <div className="preview-message-card">
            <HighlightedMessage text={renderedPreview} />
          </div>

          {isEditingTemplate && (
            <textarea
              className="custom-textarea"
              rows={2}
              value={customTemplateText}
              onChange={(e) => setCustomTemplateText(e.target.value)}
            />
          )}

          <div className="preview-bottom">
            <span className="preview-channel-note">
              Ready to send to {clusterMembers.length} {activeProfile?.cluster_name || cfg.name} (
              {selectedLang === 'en' ? 'English' : 'Bengali'})
            </span>
            <button
              type="button"
              className="btn seg-send-btn"
              disabled={clusterMembers.length === 0}
              onClick={() =>
                onLaunchSimulatedCampaign({
                  campaign_name: `${activeProfile?.cluster_name || cfg.name} · ${activeTpl.badge}`,
                  campaign_type: 'cluster',
                  cluster_id: selectedClusterId,
                  cluster_name: activeProfile?.cluster_name || cfg.name,
                  message_content: rawTemplateText,
                  language: selectedLang,
                  recipient_ids: clusterMembers.map((r) => r.customer_id),
                })
              }
            >
              Send to Group ({clusterMembers.length} Guests)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}