import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import type { InvestigationQueueEmail } from '@/utils/emailQueue';

interface InvestigationQueueTableProps {
  emails: InvestigationQueueEmail[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}

type PredictionFilter = 'all' | 'available' | 'pending';
const PAGE_SIZE = 10;

export default function InvestigationQueueTable({
  emails,
  loading,
  error,
  onRetry,
}: InvestigationQueueTableProps) {
  const [search, setSearch] = useState('');
  const [predictionFilter, setPredictionFilter] = useState<PredictionFilter>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return emails
      .filter(email => predictionFilter === 'all'
        || (predictionFilter === 'available' ? email.prediction !== null : email.prediction === null))
      .filter(email => !query || `${email.id} ${email.subject} ${email.sender}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const dateOrder = Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt);
        return dateOrder || right.id.localeCompare(left.id);
      });
  }, [emails, predictionFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetFilters = () => {
    setSearch('');
    setPredictionFilter('all');
    setPage(1);
  };

  return (
    <section className="rounded-xl border border-teal-900/30" style={{ background: 'var(--card-bg)' }}>
      <div className="flex flex-wrap items-center gap-3 border-b border-teal-900/30 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Persisted email records</h2>
          <p className="mt-0.5 text-xs text-slate-500">{filtered.length} records matching filters</p>
        </div>
        <div className="flex-1" />
        <label className="relative">
          <span className="sr-only">Search email records</span>
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search subject, sender, ID"
            className="w-52 rounded-lg py-1.5 pl-7 pr-3 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          />
        </label>
        <label>
          <span className="sr-only">Filter by prediction status</span>
          <select
            value={predictionFilter}
            onChange={event => { setPredictionFilter(event.target.value as PredictionFilter); setPage(1); }}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          >
            <option value="all">All prediction states</option>
            <option value="available">Prediction available</option>
            <option value="pending">Pending / unavailable</option>
          </select>
        </label>
        {(search || predictionFilter !== 'all') && (
          <button type="button" onClick={resetFilters} className="text-xs text-teal-300 hover:text-teal-200">
            Clear filters
          </button>
        )}
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-8">
          <p role="alert" className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-teal-700">
            <RotateCcw size={13} /> Retry
          </button>
        </div>
      ) : loading ? (
        <p role="status" className="px-5 py-8 text-sm text-slate-400">Loading saved email records…</p>
      ) : pageData.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-400">
            {emails.length === 0 ? 'No saved email records are available in this organization.' : 'No records match these filters.'}
          </p>
          {emails.length > 0 && <button type="button" onClick={resetFilters} className="mt-2 text-xs text-teal-300 hover:text-teal-200">Clear filters</button>}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-teal-900/20 text-left text-slate-500" style={{ background: 'var(--surface-raised)' }}>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Sender</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 font-medium">ML prediction</th>
                  <th className="px-4 py-3 font-medium">Record ID</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map(email => (
                  <tr key={email.id} className="border-b border-teal-900/20 align-top">
                    <td className="max-w-[240px] px-4 py-3 text-slate-200">{email.subject}</td>
                    <td className="max-w-[220px] break-words px-4 py-3 text-slate-300">{email.sender}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      <time dateTime={email.uploadedAt}>{new Date(email.uploadedAt).toLocaleString()}</time>
                    </td>
                    <td className="px-4 py-3">
                      {email.prediction ? (
                        <div>
                          <span className="capitalize text-slate-200">{email.prediction.predicted_class}</span>
                          <span className="ml-1 text-slate-400">· {(email.prediction.phishing_score * 100).toFixed(1)}%</span>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {email.prediction.score_type.replace(/_/g, ' ')} · {email.prediction.model_version}
                          </p>
                          <p className="mt-1 text-[10px] text-amber-300">Model assessment, not a confirmed finding</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">Pending / unavailable</span>
                      )}
                    </td>
                    <td className="max-w-[190px] break-all px-4 py-3 font-mono text-[10px] text-slate-500">{email.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-teal-900/20 px-5 py-3">
            <span className="text-xs text-slate-500">
              {filtered.length === 0 ? '0 results' : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous page" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={currentPage <= 1} className="rounded p-1 text-slate-400 hover:text-teal-300 disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-slate-500">Page {currentPage} of {totalPages}</span>
              <button type="button" aria-label="Next page" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={currentPage >= totalPages} className="rounded p-1 text-slate-400 hover:text-teal-300 disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
