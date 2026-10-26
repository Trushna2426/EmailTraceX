import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Clock, ArrowUpRight } from 'lucide-react';
import { emailService } from '@/services/emailService';
import type { Investigation } from '@/types';
import { investigationStatusBg, formatRelativeTime, formatDateTime } from '@/utils';
import { MOCK_INVESTIGATIONS } from '@/data/mockData';

export default function Investigations() {
  const [investigations, setInvestigations] = useState<Investigation[]>(MOCK_INVESTIGATIONS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    emailService.getInvestigations().then(data => { setInvestigations(data); setLoading(false); });
  }, []);

  const filtered = investigations.filter(inv =>
    inv.title.toLowerCase().includes(search.toLowerCase()) ||
    inv.caseId.toLowerCase().includes(search.toLowerCase()) ||
    inv.assignedAnalyst.toLowerCase().includes(search.toLowerCase())
  );

  const STATUS_ORDER = { escalated: 0, in_progress: 1, open: 2, closed: 3 };

  const sorted = [...filtered].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Investigations</h1>
          <p className="text-sm text-slate-400 mt-1">{investigations.length} active cases</p>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search cases..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-lg text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 w-52"
            style={{ background: 'var(--card-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--card-bg)' }} />
            ))
          : sorted.map(inv => (
              <div
                key={inv.id}
                className="rounded-xl border border-teal-900/30 p-5 hover:border-teal-500/30 transition-all"
                style={{ background: 'var(--card-bg)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono text-teal-400 font-semibold">{inv.caseId}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${investigationStatusBg(inv.status)}`}>
                        {inv.status.replace('_', ' ')}
                      </span>
                      {inv.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/30 text-slate-500 border border-slate-700/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-2">{inv.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{inv.summary}</p>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
                      <span>Analyst: <span className="text-slate-400">{inv.assignedAnalyst}</span></span>
                      <span>·</span>
                      <Clock size={9} />
                      <span>Updated {formatRelativeTime(inv.updatedAt)}</span>
                      <span>·</span>
                      <span>Created {formatDateTime(inv.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-slate-500">{inv.iocs.length} IOCs</div>
                    <Link
                      to={`/investigations/${inv.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-teal-400 border border-teal-500/20 hover:bg-teal-500/10 transition-colors"
                    >
                      Open <ArrowUpRight size={11} />
                    </Link>
                  </div>
                </div>
              </div>
            ))
        }

        {!loading && sorted.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">No investigations match your search.</div>
        )}
      </div>
    </div>
  );
}
