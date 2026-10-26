import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, ShieldAlert, ShieldCheck, Shield, ExternalLink, Paperclip,
  CheckCircle, Trash2, AlertTriangle, Search, ChevronRight, AlertOctagon,
  Lock, Info,
} from 'lucide-react';
import type { EmailRecord, ReviewStatus } from '@/types';
import { riskBg, riskScoreColor, formatDateTime } from '@/utils';

interface ReviewModalProps {
  email: EmailRecord;
  onClose: () => void;
  onAction: (emailId: string, action: ReviewStatus) => Promise<void>;
}

type ConfirmAction = { status: ReviewStatus; label: string; description: string } | null;

const ACTIONS = [
  { status: 'kept' as ReviewStatus, label: 'Keep in Inbox', icon: CheckCircle, color: 'text-teal-400 hover:bg-teal-500/10 border-teal-500/30', danger: false },
  { status: 'spam' as ReviewStatus, label: 'Move to Spam', icon: Trash2, color: 'text-slate-400 hover:bg-slate-500/10 border-slate-500/30', danger: false },
  { status: 'phishing' as ReviewStatus, label: 'Report as Phishing', icon: AlertOctagon, color: 'text-red-400 hover:bg-red-500/10 border-red-500/30', danger: true },
  { status: 'analyst_review' as ReviewStatus, label: 'Request Analyst Review', icon: Search, color: 'text-amber-400 hover:bg-amber-500/10 border-amber-500/30', danger: false },
  { status: 'investigating' as ReviewStatus, label: 'Create Investigation', icon: Lock, color: 'text-blue-400 hover:bg-blue-500/10 border-blue-500/30', danger: false },
];

const AUTH_COLOR = (result: string) =>
  result === 'pass' ? 'text-teal-400' : result === 'fail' ? 'text-red-400' : 'text-slate-500';

const VERDICT_COLOR = (v: string) =>
  v === 'malicious' ? 'text-red-400' : v === 'suspicious' ? 'text-amber-400' : v === 'safe' ? 'text-teal-400' : 'text-slate-500';

export default function ReviewModal({ email, onClose, onAction }: ReviewModalProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<ReviewStatus | null>(null);
  const [tab, setTab] = useState<'overview' | 'headers' | 'urls' | 'attachments'>('overview');

  const handleActionClick = (action: typeof ACTIONS[0]) => {
    if (action.danger || action.status === 'investigating' || action.status === 'analyst_review') {
      setConfirmAction({
        status: action.status,
        label: action.label,
        description: action.status === 'phishing'
          ? 'This will report the email as phishing. In a real deployment, this would notify your security team and mail provider.'
          : action.status === 'investigating'
          ? 'A new investigation case will be created for this email. Analysts will be notified.'
          : 'This will flag the email for analyst review. Your SOC team will be notified.',
      });
    } else {
      handleConfirm(action.status);
    }
  };

  const handleConfirm = async (status: ReviewStatus) => {
    setLoading(true);
    setConfirmAction(null);
    await onAction(email.id, status);
    setDone(status);
    setLoading(false);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="rounded-2xl border border-teal-500/30 p-8 text-center max-w-sm w-full" style={{ background: 'var(--surface-bg)' }}>
          <CheckCircle size={40} className="text-teal-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Action Recorded</h3>
          <p className="text-sm text-slate-400 mb-1">
            Decision saved: <span className="text-teal-300 font-medium">{ACTIONS.find(a => a.status === done)?.label ?? done}</span>
          </p>
          <p className="text-xs text-slate-600 mb-6">Demo mode — no real mailbox was modified.</p>
          {done === 'investigating' && email.caseId && (
            <Link
              to={`/investigations/${email.caseId}`}
              onClick={onClose}
              className="flex items-center justify-center gap-1 text-sm text-teal-400 hover:text-teal-300 mb-4 transition-colors"
            >
              Open Investigation <ChevronRight size={13} />
            </Link>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: '#14B8A6' }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="relative w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[88vh] rounded-t-2xl sm:rounded-2xl border border-teal-900/40 flex flex-col overflow-hidden"
        style={{ background: 'var(--surface-bg)' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-teal-900/30 flex-shrink-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            email.riskLevel === 'critical' ? 'bg-red-500/15' :
            email.riskLevel === 'high' ? 'bg-amber-500/15' :
            email.riskLevel === 'medium' ? 'bg-yellow-500/15' : 'bg-teal-500/15'
          }`}>
            {email.riskLevel === 'critical' || email.riskLevel === 'high'
              ? <ShieldAlert size={16} className={email.riskLevel === 'critical' ? 'text-red-400' : 'text-amber-400'} />
              : email.riskLevel === 'medium'
              ? <Shield size={16} className="text-yellow-300" />
              : <ShieldCheck size={16} className="text-teal-400" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${riskBg(email.riskLevel)}`}>
                {email.riskLevel}
              </span>
              <span className={`text-lg font-bold ${riskScoreColor(email.riskScore)}`}>{email.riskScore}<span className="text-slate-600 text-xs font-normal">/100</span></span>
            </div>
            <h2 className="text-sm font-semibold text-white mt-1 line-clamp-1">{email.subject}</h2>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>From: <span className="text-slate-400">{email.senderEmail}</span></span>
              <span>·</span>
              <span>To: <span className="text-slate-400">{email.recipient}</span></span>
              <span>·</span>
              <span>{formatDateTime(email.receivedAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-teal-500/10 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-teal-900/30 px-5 flex-shrink-0">
          {(['overview', 'headers', 'urls', 'attachments'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'urls' ? `URLs (${email.urls.length})` :
               t === 'attachments' ? `Attachments (${email.attachments.length})` :
               t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Risk explanation */}
              {(email.riskLevel === 'high' || email.riskLevel === 'critical') && (
                <div className="flex gap-3 p-3 rounded-lg border" style={{
                  background: email.riskLevel === 'critical' ? 'rgba(240,82,82,0.07)' : 'rgba(245,185,66,0.07)',
                  borderColor: email.riskLevel === 'critical' ? 'rgba(240,82,82,0.25)' : 'rgba(245,185,66,0.25)',
                }}>
                  <AlertTriangle size={14} className={email.riskLevel === 'critical' ? 'text-red-400 mt-0.5 flex-shrink-0' : 'text-amber-400 mt-0.5 flex-shrink-0'} />
                  <p className="text-xs text-slate-300 leading-relaxed">{email.riskExplanation}</p>
                </div>
              )}

              {/* Body snippet */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Email Preview</div>
                <div className="p-3 rounded-lg text-xs text-slate-400 leading-relaxed italic border border-teal-900/20" style={{ background: 'var(--app-bg)' }}>
                  "{email.bodySnippet}"
                </div>
              </div>

              {/* Indicators */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Detected Indicators</div>
                <div className="flex flex-wrap gap-1.5">
                  {email.indicators.map((ind, i) => (
                    <span key={i} className="px-2 py-1 rounded-md text-xs bg-slate-700/40 text-slate-300 border border-slate-700/30">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sender auth */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Sender Authentication</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['spf', 'dkim', 'dmarc'] as const).map(check => {
                    const result = email[`${check}Result`];
                    return (
                      <div key={check} className="p-2.5 rounded-lg border border-teal-900/20 text-center" style={{ background: 'var(--app-bg)' }}>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{check}</div>
                        <div className={`text-xs font-bold uppercase ${AUTH_COLOR(result)}`}>{result}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {email.riskLevel !== 'low' && (
                <div className="flex gap-2 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                  <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This is a demonstration. Decisions recorded here do not affect any real mailbox. Real mailbox integration requires an authorized backend deployment.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'headers' && (
            <div className="space-y-2">
              {Object.entries(email.headers).map(([k, v]) => (
                <div key={k} className="flex gap-3 text-xs p-2.5 rounded-lg" style={{ background: 'var(--app-bg)' }}>
                  <span className="text-teal-400 font-mono font-medium w-36 flex-shrink-0">{k}</span>
                  <span className="text-slate-400 font-mono break-all">{v}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'urls' && (
            <div className="space-y-2">
              {email.urls.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-8">No URLs found in this email.</div>
              ) : email.urls.map((url, i) => (
                <div key={i} className="p-3 rounded-lg border border-teal-900/20" style={{ background: 'var(--app-bg)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase ${VERDICT_COLOR(url.verdict)}`}>{url.verdict}</span>
                    <span className="text-[10px] text-slate-600">{url.redirects} redirect{url.redirects !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono break-all flex items-start gap-1">
                    <ExternalLink size={10} className="text-slate-600 mt-0.5 flex-shrink-0" />
                    <span className="select-all">{url.url}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">Domain: {url.domain}</div>
                  <p className="text-[10px] text-amber-400 mt-1.5">Do not open this URL in a browser outside of a sandbox.</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'attachments' && (
            <div className="space-y-2">
              {email.attachments.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-8">No attachments found.</div>
              ) : email.attachments.map((att, i) => (
                <div key={i} className="p-3 rounded-lg border border-teal-900/20" style={{ background: 'var(--app-bg)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Paperclip size={12} className="text-slate-500" />
                    <span className="text-xs text-slate-200 font-medium font-mono">{att.filename}</span>
                    <span className={`ml-auto text-xs font-semibold uppercase ${VERDICT_COLOR(att.verdict)}`}>{att.verdict}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5">
                    <div>Type: <span className="text-slate-400 font-mono">{att.mimetype}</span></div>
                    <div>Hash: <span className="text-slate-400 font-mono select-all">{att.hash}</span></div>
                    <div>Size: <span className="text-slate-400">{(att.size / 1024).toFixed(1)} KB</span></div>
                  </div>
                  <p className="text-[10px] text-red-400 mt-1.5">Do not open this attachment. It may contain malware.</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-teal-900/30 flex-shrink-0" style={{ background: 'var(--app-bg)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ACTIONS.map(action => (
              <button
                key={action.status}
                onClick={() => handleActionClick(action)}
                disabled={loading || email.reviewStatus === action.status}
                className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${action.color}`}
              >
                <action.icon size={14} />
                <span className="text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Confirm dialog */}
        {confirmAction && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl z-10">
            <div className="rounded-xl border border-teal-900/40 p-6 max-w-sm w-full mx-4" style={{ background: 'var(--surface-bg)' }}>
              <AlertTriangle size={28} className="text-amber-400 mb-3" />
              <h3 className="text-sm font-semibold text-white mb-2">{confirmAction.label}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-5">{confirmAction.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-teal-900/30 transition-colors"
                  style={{ background: 'var(--card-bg)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirm(confirmAction.status)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ background: confirmAction.status === 'phishing' ? '#F05252' : '#14B8A6' }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
