import { useState } from 'react';
import { Upload, Mail, AlertCircle, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import type { EmailRecord } from '@/types';
import ReviewModal from '@/components/email-review/ReviewModal';
import { riskBg, riskScoreColor } from '@/utils';
import EmailUpload from '@/pages/EmailUpload';

// Simulated analysis result for demo
const DEMO_RESULT: EmailRecord = {
  id: 'demo-analysis',
  subject: 'Your account has been locked — verify now',
  sender: 'Security Team',
  senderEmail: 'security@paypa1-account.com',
  recipient: 'you@acmecorp.com',
  receivedAt: new Date().toISOString(),
  analyzedAt: new Date().toISOString(),
  riskLevel: 'critical',
  riskScore: 91,
  reviewStatus: 'pending',
  indicators: ['Brand impersonation', 'Lookalike domain', 'Urgent language', 'SPF fail'],
  spfResult: 'fail',
  dkimResult: 'fail',
  dmarcResult: 'fail',
  urls: [{ url: 'https://paypa1-account.com/verify', verdict: 'malicious', redirects: 2, domain: 'paypa1-account.com' }],
  attachments: [],
  bodySnippet: 'We have detected unusual activity on your account. Your account has been temporarily locked. Verify your identity within 48 hours to restore access...',
  riskExplanation: 'The sender domain "paypa1-account.com" uses a lookalike domain (replacing "l" with "1") to impersonate PayPal. SPF and DKIM authentication both failed. Urgency language and a suspicious verification link are consistent with credential phishing.',
  headers: { 'X-Originating-IP': '77.220.148.52', 'Received-SPF': 'fail', 'X-Spam-Score': '8.4' },
};

type AnalysisState = 'idle' | 'analyzing' | 'done';

function DemoAnalyzeEmail() {
  const [emailText, setEmailText] = useState('');
  const [state, setState] = useState<AnalysisState>('idle');
  const [result, setResult] = useState<EmailRecord | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleAnalyze = async () => {
    if (!emailText.trim()) return;
    setState('analyzing');
    await new Promise(r => setTimeout(r, 2200));
    setResult(DEMO_RESULT);
    setState('done');
  };

  const handleReset = () => {
    setEmailText('');
    setState('idle');
    setResult(null);
    setShowModal(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Analyze Email</h1>
        <p className="text-sm text-slate-400 mt-1">
          Paste raw email content or headers for AI-powered threat analysis. Demo mode — no real API calls are made.
        </p>
      </div>

      {state !== 'done' ? (
        <div className="rounded-xl border border-teal-900/30 p-6" style={{ background: 'var(--card-bg)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Mail size={16} className="text-teal-400" />
            <h2 className="text-sm font-semibold text-slate-200">Email Content</h2>
          </div>
          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            placeholder="Paste the raw email content, headers, or forward the suspicious email text here..."
            className="w-full h-64 p-4 rounded-lg text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-none font-mono"
            style={{ background: 'var(--app-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
          />
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 border border-dashed border-teal-900/30 rounded-lg px-4 py-3 flex-1 cursor-pointer hover:border-teal-500/30 transition-colors">
              <Upload size={13} className="text-slate-600" />
              <span>Drop .eml file here (coming soon)</span>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!emailText.trim() || state === 'analyzing'}
              className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#14B8A6' }}
            >
              {state === 'analyzing' ? (
                <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Mail size={14} /> Analyze</>
              )}
            </button>
          </div>

          {state === 'analyzing' && (
            <div className="mt-4 space-y-2">
              {['Parsing email structure...', 'Checking sender authentication...', 'Extracting URLs and attachments...', 'Running threat intelligence...'].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-400 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                  <Loader2 size={10} className="animate-spin text-teal-400" />
                  {step}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        result && (
          <div className="rounded-xl border border-teal-900/30 p-6 space-y-4" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-teal-400" />
                <h2 className="text-sm font-semibold text-slate-200">Analysis Complete</h2>
              </div>
              <button onClick={handleReset} className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-300 transition-colors">
                <RotateCcw size={11} /> New Analysis
              </button>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-lg border border-teal-900/20" style={{ background: 'var(--app-bg)' }}>
              <div>
                <div className="text-xs text-slate-500 mb-1">Risk Level</div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${riskBg(result.riskLevel)}`}>
                  {result.riskLevel}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Risk Score</div>
                <span className={`text-2xl font-bold ${riskScoreColor(result.riskScore)}`}>{result.riskScore}<span className="text-slate-600 text-sm">/100</span></span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 mb-1">Subject</div>
                <div className="text-sm text-slate-200 font-medium truncate">{result.subject}</div>
              </div>
            </div>

            {result.riskLevel === 'high' || result.riskLevel === 'critical' ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-300 leading-relaxed">{result.riskExplanation}</p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: '#14B8A6' }}
              >
                Review & Take Action
              </button>
            </div>
          </div>
        )
      )}

      <div className="rounded-xl border border-teal-900/20 p-4" style={{ background: 'var(--surface-bg)' }}>
        <h3 className="text-xs font-semibold text-slate-400 mb-2">Demo Mode Notice</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Analysis results are simulated for demonstration purposes. In a production deployment, this module connects to a Python FastAPI backend that performs real header parsing, URL sandboxing, attachment scanning, and threat intelligence lookups.
        </p>
      </div>

      {showModal && result && (
        <ReviewModal
          email={result}
          onClose={() => setShowModal(false)}
          onAction={async () => {}}
        />
      )}
    </div>
  );
}

export default function AnalyzeEmail({ isDemo }: { isDemo: boolean }) {
  return isDemo ? <DemoAnalyzeEmail /> : <EmailUpload />;
}
