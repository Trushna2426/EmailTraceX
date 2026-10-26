import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import type { Investigation, IOC } from '@/types';
import { investigationStatusBg, formatRelativeTime } from '@/utils';

interface RecentInvestigationsProps {
  investigations: Investigation[];
  loading: boolean;
}

export function RecentInvestigations({ investigations, loading }: RecentInvestigationsProps) {
  return (
    <div className="rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Recent Investigations</h3>
        <Link to="/investigations" className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--surface-bg)' }} />
            ))
          : investigations.slice(0, 4).map(inv => (
              <Link
                key={inv.id}
                to={`/investigations/${inv.id}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-teal-500/5 transition-colors border border-transparent hover:border-teal-900/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-teal-400">{inv.caseId}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${investigationStatusBg(inv.status)}`}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5 truncate font-medium">{inv.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{inv.assignedAnalyst}</span>
                    <span className="text-slate-700">·</span>
                    <Clock size={9} className="text-slate-600" />
                    <span className="text-[10px] text-slate-600">{formatRelativeTime(inv.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}

interface RecentIndicatorsProps {
  iocs: IOC[];
  loading: boolean;
}

const IOC_TYPE_COLORS: Record<string, string> = {
  domain: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  ip: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  url: 'text-red-400 bg-red-500/10 border-red-500/20',
  hash: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  email: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
};

export function RecentIndicators({ iocs, loading }: RecentIndicatorsProps) {
  return (
    <div className="rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Extracted Indicators (IOCs)</h3>
        <Link to="/evidence" className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors">
          Evidence Graph <ArrowRight size={11} />
        </Link>
      </div>
      <div className="space-y-2.5">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--surface-bg)' }} />
            ))
          : iocs.slice(0, 6).map(ioc => (
              <div key={ioc.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${IOC_TYPE_COLORS[ioc.type] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                  {ioc.type}
                </span>
                <span className="text-xs text-slate-300 font-mono truncate flex-1">{ioc.value}</span>
                <span className={`text-[9px] font-semibold uppercase ${
                  ioc.verdict === 'malicious' ? 'text-red-400' :
                  ioc.verdict === 'suspicious' ? 'text-amber-400' :
                  ioc.verdict === 'benign' ? 'text-teal-400' : 'text-slate-500'
                }`}>
                  {ioc.verdict}
                </span>
                <span className="text-[9px] text-slate-600 font-mono">{ioc.caseId}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}
