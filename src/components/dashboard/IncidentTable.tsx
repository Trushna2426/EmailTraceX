import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Eye, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EmailRecord, RiskLevel, ReviewStatus } from '@/types';
import { riskBg, reviewStatusBg, reviewStatusLabel, formatRelativeTime, riskScoreColor } from '@/utils';

interface IncidentTableProps {
  emails: EmailRecord[];
  loading: boolean;
  onViewEmail: (email: EmailRecord) => void;
}

type SortField = 'riskScore' | 'receivedAt' | 'subject' | 'sender';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 5;

const RISK_FILTER_OPTIONS: { value: RiskLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'All Risks' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_FILTER_OPTIONS: { value: ReviewStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'analyst_review', label: 'Analyst Review' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'spam', label: 'Spam' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'kept', label: 'Kept' },
];

export default function IncidentTable({ emails, loading, onViewEmail }: IncidentTableProps) {
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let list = [...emails];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.senderEmail.toLowerCase().includes(q)
      );
    }
    if (riskFilter !== 'all') list = list.filter(e => e.riskLevel === riskFilter);
    if (statusFilter !== 'all') list = list.filter(e => e.reviewStatus === statusFilter);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'riskScore') cmp = a.riskScore - b.riskScore;
      else if (sortField === 'receivedAt') cmp = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
      else if (sortField === 'subject') cmp = a.subject.localeCompare(b.subject);
      else if (sortField === 'sender') cmp = a.sender.localeCompare(b.sender);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [emails, searchQuery, riskFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="inline-flex flex-col ml-1 opacity-50">
      {sortField === field
        ? sortDir === 'asc'
          ? <ChevronUp size={10} className="opacity-100 text-teal-400" />
          : <ChevronDown size={10} className="opacity-100 text-teal-400" />
        : <ChevronDown size={10} />
      }
    </span>
  );

  return (
    <div className="rounded-xl border border-teal-900/30" style={{ background: 'var(--card-bg)' }}>
      <div className="px-5 py-4 border-b border-teal-900/30 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Priority Review Queue</h3>
          <p className="text-xs text-slate-500 mt-0.5">{filtered.length} emails matching filters</p>
        </div>
        <div className="flex-1" />
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-7 pr-3 py-1.5 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 w-40"
            style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          />
        </div>
        {/* Risk filter */}
        <div className="relative">
          <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            value={riskFilter}
            onChange={e => { setRiskFilter(e.target.value as RiskLevel | 'all'); setPage(1); }}
            className="pl-7 pr-6 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50 appearance-none cursor-pointer"
            style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          >
            {RISK_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value as ReviewStatus | 'all'); setPage(1); }}
          className="pl-3 pr-6 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50 appearance-none cursor-pointer"
          style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
        >
          {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-teal-900/20" style={{ background: 'var(--surface-raised)' }}>
              <th className="text-left px-4 py-3 text-slate-500 font-medium cursor-pointer hover:text-teal-400" onClick={() => handleSort('riskScore')}>
                Risk <SortIcon field="riskScore" />
              </th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium cursor-pointer hover:text-teal-400" onClick={() => handleSort('subject')}>
                Subject <SortIcon field="subject" />
              </th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium cursor-pointer hover:text-teal-400 hidden md:table-cell" onClick={() => handleSort('sender')}>
                Sender <SortIcon field="sender" />
              </th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium hidden lg:table-cell">Indicators</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium cursor-pointer hover:text-teal-400" onClick={() => handleSort('riskScore')}>
                Score <SortIcon field="riskScore" />
              </th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium cursor-pointer hover:text-teal-400 hidden sm:table-cell" onClick={() => handleSort('receivedAt')}>
                Received <SortIcon field="receivedAt" />
              </th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium hidden md:table-cell">Status</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-teal-900/20">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse" style={{ background: 'var(--surface-bg)', width: '70%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">No emails match the current filters.</td>
              </tr>
            ) : pageData.map(email => (
              <tr
                key={email.id}
                className="border-b border-teal-900/20 hover:bg-teal-500/5 transition-colors cursor-pointer"
                onClick={() => onViewEmail(email)}
              >
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${riskBg(email.riskLevel)}`}>
                    {email.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[180px]">
                  <div className="text-slate-200 font-medium truncate">{email.subject}</div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="text-slate-300 truncate max-w-[140px]">{email.sender}</div>
                  <div className="text-slate-500 truncate max-w-[140px] mt-0.5">{email.senderEmail}</div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {email.indicators.slice(0, 2).map((ind, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/40 text-slate-400 border border-slate-700/30">
                        {ind}
                      </span>
                    ))}
                    {email.indicators.length > 2 && (
                      <span className="text-[10px] text-slate-500">+{email.indicators.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-bold text-sm ${riskScoreColor(email.riskScore)}`}>{email.riskScore}</span>
                  <span className="text-slate-600">/100</span>
                </td>
                <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">
                  {formatRelativeTime(email.receivedAt)}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${reviewStatusBg(email.reviewStatus)}`}>
                    {reviewStatusLabel(email.reviewStatus)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onViewEmail(email)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 transition-colors ml-auto text-[11px] font-medium border border-teal-500/20"
                  >
                    <Eye size={11} />
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-teal-900/20">
        <span className="text-xs text-slate-500">
          {filtered.length === 0 ? '0 results' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded text-slate-400 hover:text-teal-300 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-6 h-6 rounded text-xs transition-colors ${page === i + 1 ? 'bg-teal-500/20 text-teal-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 rounded text-slate-400 hover:text-teal-300 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
