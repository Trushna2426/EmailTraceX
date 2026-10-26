import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Clock, User, Tag, FileText, Globe, Hash, Mail,
  Link2, Shield, Plus, Download, ChevronRight,
} from 'lucide-react';
import { emailService } from '@/services/emailService';
import type { Investigation, IOC } from '@/types';
import { investigationStatusBg, formatDateTime, formatRelativeTime } from '@/utils';
import { MOCK_INVESTIGATIONS } from '@/data/mockData';

const IOC_ICON: Record<string, ElementType> = {
  domain: Globe,
  ip: Shield,
  url: Link2,
  hash: Hash,
  email: Mail,
};

const IOC_COLORS: Record<string, string> = {
  domain: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  ip: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  url: 'text-red-400 bg-red-500/10 border-red-500/20',
  hash: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  email: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
};

function EvidenceGraphMini({ iocs }: { iocs: IOC[] }) {
  const [selected, setSelected] = useState<IOC | null>(null);

  return (
    <div className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-300">Evidence Relationship Graph</h4>
        <Link to="/correlation" className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors">
          Full view <ChevronRight size={10} />
        </Link>
      </div>

      <div className="relative h-40 rounded-lg overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}>
        {/* Central email node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-12 h-12 rounded-full border-2 border-teal-500/40 flex items-center justify-center text-[10px] text-teal-300 font-semibold shadow-lg"
            style={{ background: 'var(--surface-bg)' }}>
            Email
          </div>
        </div>

        {/* IOC nodes arranged around center */}
        {iocs.slice(0, 5).map((ioc, i) => {
          const angle = (i / Math.min(iocs.length, 5)) * 2 * Math.PI - Math.PI / 2;
          const r = 65;
          const x = 50 + Math.cos(angle) * r;
          const y = 50 + Math.sin(angle) * r;
          const Icon = IOC_ICON[ioc.type] ?? FileText;
          const isSelected = selected?.id === ioc.id;
          return (
            <button
              key={ioc.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                isSelected ? 'scale-110 border-teal-400/60' : 'border-slate-700/40 hover:border-teal-600/40'
              }`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                background: 'var(--card-bg)',
              }}
              onClick={() => setSelected(isSelected ? null : ioc)}
              title={ioc.value}
            >
              <Icon size={12} className={ioc.verdict === 'malicious' ? 'text-red-400' : ioc.verdict === 'suspicious' ? 'text-amber-400' : 'text-teal-400'} />
            </button>
          );
        })}

        {/* SVG lines from center to nodes */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {iocs.slice(0, 5).map((ioc, i) => {
            const angle = (i / Math.min(iocs.length, 5)) * 2 * Math.PI - Math.PI / 2;
            const r = 65;
            const x = 50 + Math.cos(angle) * r;
            const y = 50 + Math.sin(angle) * r;
            return (
              <line
                key={ioc.id}
                x1="50" y1="50"
                x2={x} y2={y}
                stroke={ioc.verdict === 'malicious' ? 'rgba(240,82,82,0.3)' : 'rgba(20,184,166,0.2)'}
                strokeWidth="0.5"
                strokeDasharray="2 1"
              />
            );
          })}
        </svg>
      </div>

      {selected && (
        <div className="mt-3 p-2.5 rounded-lg border border-teal-900/20 text-xs" style={{ background: 'var(--surface-bg)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${IOC_COLORS[selected.type]}`}>{selected.type}</span>
            <span className={`text-[10px] font-semibold ${selected.verdict === 'malicious' ? 'text-red-400' : selected.verdict === 'suspicious' ? 'text-amber-400' : 'text-teal-400'}`}>{selected.verdict}</span>
          </div>
          <div className="text-slate-300 font-mono break-all">{selected.value}</div>
          <div className="text-slate-500 mt-0.5">Source: {selected.source} · First seen {formatRelativeTime(selected.firstSeen)}</div>
        </div>
      )}
    </div>
  );
}

export default function InvestigationDetail() {
  const { id } = useParams<{ id: string }>();
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'iocs' | 'timeline' | 'evidence'>('overview');

  useEffect(() => {
    if (!id) return;
    emailService.getInvestigationById(id).then(inv => {
      setInvestigation(inv ?? MOCK_INVESTIGATIONS[0]);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--card-bg)' }} />
        ))}
      </div>
    );
  }

  if (!investigation) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="mb-3">Investigation not found.</p>
        <Link to="/investigations" className="text-teal-400 hover:text-teal-300 text-sm">Back to Investigations</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link to="/investigations" className="p-1.5 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/5 transition-colors mt-0.5">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-mono text-teal-400 font-semibold">{investigation.caseId}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${investigationStatusBg(investigation.status)}`}>
              {investigation.status.replace('_', ' ')}
            </span>
            {investigation.tags.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/30 text-slate-500 border border-slate-700/20">{t}</span>
            ))}
          </div>
          <h1 className="text-lg font-bold text-white">{investigation.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><User size={10} />{investigation.assignedAnalyst}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock size={10} />Updated {formatRelativeTime(investigation.updatedAt)}</span>
            <span>·</span>
            <span>Created {formatDateTime(investigation.createdAt)}</span>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border border-teal-500/20 hover:bg-teal-500/5 transition-colors">
          <Download size={12} />
          Export
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-teal-900/30">
        {(['overview', 'iocs', 'timeline', 'evidence'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors -mb-px ${
              activeTab === t ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'iocs' ? `IOCs (${investigation.iocs.length})` :
             t === 'timeline' ? `Timeline (${investigation.timeline.length})` :
             t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">Summary</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{investigation.summary}</p>
            </div>
            <div className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">Analyst Notes</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">{investigation.notes}</p>
              <div className="flex gap-2">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note..."
                  className="flex-1 p-2.5 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-none h-16"
                  style={{ background: 'var(--app-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
                />
                <button
                  className="px-3 self-end py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: '#14B8A6' }}
                  disabled={!note.trim()}
                  onClick={() => setNote('')}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-3">Case Details</h3>
              <div className="space-y-2.5 text-xs">
                {[
                  { label: 'Case ID', value: investigation.caseId },
                  { label: 'Status', value: investigation.status.replace('_', ' ') },
                  { label: 'Analyst', value: investigation.assignedAnalyst },
                  { label: 'IOC Count', value: `${investigation.iocs.length}` },
                ].map(item => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="text-slate-300 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <EvidenceGraphMini iocs={investigation.iocs} />
          </div>
        </div>
      )}

      {activeTab === 'iocs' && (
        <div className="space-y-2">
          {investigation.iocs.map(ioc => {
            const Icon = IOC_ICON[ioc.type] ?? FileText;
            return (
              <div key={ioc.id} className="flex items-center gap-3 p-3 rounded-lg border border-teal-900/20" style={{ background: 'var(--card-bg)' }}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${IOC_COLORS[ioc.type]}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 font-mono font-medium truncate">{ioc.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Source: {ioc.source} · {formatRelativeTime(ioc.firstSeen)}</div>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                  ioc.verdict === 'malicious' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                  ioc.verdict === 'suspicious' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                  'text-teal-400 bg-teal-500/10 border-teal-500/20'
                }`}>
                  {ioc.verdict}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-0">
          {investigation.timeline.map((event, i) => (
            <div key={event.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-teal-500 flex-shrink-0 mt-1" style={{ background: '#14B8A6' }} />
                {i < investigation.timeline.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ background: 'rgba(20,184,166,0.2)' }} />
                )}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-200">{event.action}</span>
                  <span className="text-[10px] text-slate-500">by {event.actor}</span>
                  <span className="text-[10px] text-slate-600">{formatRelativeTime(event.timestamp)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {['Headers', 'Body Analysis', 'URLs', 'Attachments', 'IP/DNS', 'Threat Intelligence'].map(cat => (
            <div key={cat} className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <Tag size={11} className="text-teal-400" />
                {cat}
              </h3>
              <p className="text-xs text-slate-500">Evidence data for {cat.toLowerCase()} will be populated from the email analysis pipeline.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
