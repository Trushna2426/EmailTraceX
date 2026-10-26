import { useEffect, useState } from 'react';
import { AlertCircle, FileText, LoaderCircle, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { emailUploadService, type EmailPrediction, type UploadedEmailRecord } from '@/services/emailUploadService';

function Values({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-200">{values.length ? values.join(', ') : 'Unavailable'}</dd>
    </div>
  );
}

export default function EmailUpload() {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pastedEmail, setPastedEmail] = useState('');
  const [records, setRecords] = useState<UploadedEmailRecord[]>([]);
  const [selected, setSelected] = useState<UploadedEmailRecord | null>(null);
  const [prediction, setPrediction] = useState<EmailPrediction | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    emailUploadService.list()
      .then(items => { if (active) setRecords(items); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load email records.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const upload = async () => {
    if (!file || isUploading) return;
    setError('');
    setNotice('');
    setIsUploading(true);
    try {
      const record = await emailUploadService.upload(file);
      setRecords(current => [record, ...current.filter(item => item.id !== record.id)]);
      setSelected(record);
      setNotice('Email parsed and saved. No threat verdict or security scan was performed.');
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Email upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const paste = async () => {
    if (!pastedEmail.trim() || isUploading) return;
    setError('');
    setNotice('');
    setIsUploading(true);
    try {
      const record = await emailUploadService.paste(pastedEmail);
      setRecords(current => [record, ...current.filter(item => item.id !== record.id)]);
      setSelected(record);
      setPrediction(record.prediction ?? null);
      setNotice('Pasted email parsed and saved. No threat verdict or security scan was performed.');
      setPastedEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pasted email could not be parsed.');
    } finally {
      setIsUploading(false);
    }
  };

  const runPrediction = async () => {
    if (!selected || isPredicting) return;
    setPrediction(null);
    setPredictionError('');
    setIsPredicting(true);
    try {
      const result = await emailUploadService.predict(selected.id);
      setPrediction(result);
      setSelected(current => current ? { ...current, prediction: result } : current);
      setRecords(current => current.map(record => record.id === selected.id ? { ...record, prediction: result } : record));
    } catch (reason) {
      setPredictionError(reason instanceof Error ? reason.message : 'Email model analysis failed.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-bold text-white">Analyze Email</h1>
        <p className="mt-1 text-sm text-slate-400">Upload an .eml file or paste a complete raw email to inspect parsed headers and content. Parsing does not determine whether an email is malicious.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
        <div role="tablist" aria-label="Email input mode" className="flex gap-2">
          <button
            id="upload-email-tab"
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            onClick={() => { setMode('upload'); setError(''); setNotice(''); }}
            className={`rounded-lg px-3 py-2 text-sm ${mode === 'upload' ? 'bg-teal-500 text-white' : 'border border-slate-700 text-slate-300'}`}
          >
            Upload .eml
          </button>
          <button
            id="paste-email-tab"
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            onClick={() => { setMode('paste'); setError(''); setNotice(''); }}
            className={`rounded-lg px-3 py-2 text-sm ${mode === 'paste' ? 'bg-teal-500 text-white' : 'border border-slate-700 text-slate-300'}`}
          >
            Paste email
          </button>
        </div>
        {mode === 'upload' ? (
          <>
            <label htmlFor="email-file" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-teal-700/40 p-4 hover:border-teal-500/60">
              <Upload size={18} className="text-teal-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-200">Choose an .eml file</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Upload size is limited by the server configuration.'}</span>
              </span>
              <input id="email-file" type="file" accept=".eml,message/rfc822" className="sr-only" disabled={isUploading} onChange={event => {
                setError('');
                setNotice('');
                setFile(event.currentTarget.files?.[0] ?? null);
              }} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void upload()} disabled={!file || isUploading} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isUploading ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
                {isUploading ? 'Uploading and parsing…' : 'Upload and parse'}
              </button>
              <button type="button" onClick={() => { setFile(null); setError(''); setNotice(''); }} disabled={isUploading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 disabled:opacity-50">
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="pasted-email" className="block text-sm font-medium text-slate-200">Complete raw email</label>
            <textarea
              id="pasted-email"
              value={pastedEmail}
              onChange={event => { setPastedEmail(event.target.value); setError(''); setNotice(''); }}
              disabled={isUploading}
              placeholder={'From: sender@example.com\nTo: recipient@example.com\nSubject: Message subject\n\nEmail body'}
              className="min-h-72 w-full resize-y rounded-lg p-4 font-mono text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
              style={{ background: 'var(--app-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
              aria-describedby="paste-email-guidance"
            />
            <p id="paste-email-guidance" className="text-xs leading-5 text-slate-500">
              Include the original headers and a blank line before the body. Body-only text is not accepted: it lacks forensic header evidence and headers will not be invented. The server upload size limit applies.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void paste()} disabled={!pastedEmail.trim() || isUploading} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isUploading ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}
                {isUploading ? 'Parsing and saving…' : 'Parse and save'}
              </button>
              <button type="button" onClick={() => { setPastedEmail(''); setError(''); setNotice(''); }} disabled={isUploading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 disabled:opacity-50">
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </>
        )}
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-200">{notice}</p>}
      </section>

      {selected && (
        <section className="space-y-5 rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
          <div>
            <h2 className="text-base font-semibold text-white">{selected.parsed.overview.subject[0] || '(No subject)'}</h2>
            <p className="mt-1 text-xs text-slate-500">{selected.original_filename} · Uploaded {new Date(selected.uploaded_at).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-teal-900/30 p-4" style={{ background: 'var(--app-bg)' }}>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void runPrediction()} disabled={isPredicting} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isPredicting ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {isPredicting ? 'Running model…' : prediction ? 'Run model again' : 'Run phishing model'}
              </button>
              <span className="text-xs text-slate-500">Model assessment only; this is not a confirmed security finding.</span>
            </div>
            {predictionError && <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{predictionError}</p>}
            {prediction && (
              <div role="status" className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                <p className="text-sm font-semibold text-slate-200">
                  Model assessment: <span className="capitalize text-teal-200">{prediction.predicted_class}</span>
                  {prediction.review_recommended && <span className="ml-2 text-amber-300">Review recommended</span>}
                </p>
                <p className="text-xs text-slate-400">
                  Phishing model score: {(prediction.phishing_score * 100).toFixed(1)}% · Uncalibrated score · {prediction.model_version}
                </p>
                {prediction.explanation.map((item, index) => <p key={`${index}-${item}`} className="text-xs leading-5 text-slate-400">{item}</p>)}
                <p className="text-xs text-amber-300">This ML output is not a confirmed finding and must be reviewed by an analyst.</p>
              </div>
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Values label="From" values={selected.parsed.participants.from} />
            <Values label="To" values={selected.parsed.participants.to} />
            <Values label="Cc" values={selected.parsed.participants.cc} />
            <Values label="Reply-To" values={selected.parsed.participants.reply_to} />
            <Values label="Date" values={selected.parsed.overview.date ? [selected.parsed.overview.date] : []} />
            <Values label="Message-ID" values={selected.parsed.overview.message_id} />
            <Values label="Return-Path" values={selected.parsed.overview.return_path} />
          </dl>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Received headers</h3>
            {selected.parsed.routing.received.length
              ? selected.parsed.routing.received.map((value, index) => <p key={`${index}-${value}`} className="border-l border-teal-800/50 py-1 pl-3 text-xs text-slate-400">{value}</p>)
              : <p className="text-sm text-slate-500">Unavailable</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Authentication-related headers</h3>
            {selected.parsed.authentication_headers.length
              ? selected.parsed.authentication_headers.map((header, index) => <p key={`${index}-${header.name}`} className="break-words py-1 text-xs text-slate-400"><strong className="text-slate-300">{header.name}:</strong> {header.value}</p>)
              : <p className="text-sm text-slate-500">None observed; this is not itself a threat verdict.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">URLs (not visited)</h3>
            {selected.parsed.urls.length
              ? selected.parsed.urls.map((url, index) => <p key={`${index}-${url}`} className="break-all py-1 text-xs text-teal-300">{url}</p>)
              : <p className="text-sm text-slate-500">No URLs found.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">MIME structure and attachments</h3>
            <p className="mb-2 text-xs text-slate-400">HTML body available: {selected.parsed.mime.html_available ? 'Yes (not rendered)' : 'No'}</p>
            {selected.parsed.mime.parts.map((part, index) => (
              <p key={`mime-${index}`} className="py-1 text-xs text-slate-400">MIME part: {part.filename || part.content_type} · {part.content_type} · {part.decoded_size} bytes</p>
            ))}
            {selected.parsed.attachments.map((part, index) => (
              <p key={`attachment-${index}`} className="py-1 text-xs text-slate-400">Attachment: {part.filename || '(unnamed)'} · {part.content_type} · {part.decoded_size} bytes</p>
            ))}
            {!selected.parsed.mime.parts.length && <p className="text-sm text-slate-500">No MIME parts reported.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Plain-text body preview</h3>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs text-slate-300" style={{ background: 'var(--app-bg)' }}>{selected.parsed.plain_text_preview || '(No plain-text body found)'}{selected.parsed.plain_text_truncated ? '\n… Preview truncated.' : ''}</pre>
          </div>
          {selected.parsed.warnings.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-amber-300">Parsing warnings</h3>{selected.parsed.warnings.map((warning, index) => <p key={`${index}-${warning}`} className="text-xs text-amber-200">{warning}</p>)}</div>}
        </section>
      )}

      <section className="rounded-xl border border-teal-900/20 p-5" style={{ background: 'var(--surface-bg)' }}>
        <h2 className="text-sm font-semibold text-slate-200">Previously uploaded messages</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Loading records…</p> : records.length === 0 ? <p className="mt-3 text-sm text-slate-500">No uploaded messages are available in your organization.</p> : (
          <ul className="mt-3 divide-y divide-slate-800/70">
            {records.map(record => (
              <li key={record.id}>
                <button type="button" onClick={() => { setSelected(record); setPrediction(record.prediction ?? null); setPredictionError(''); }} className="flex w-full items-center gap-3 py-3 text-left hover:text-teal-200">
                  <FileText size={15} className="shrink-0 text-teal-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{record.parsed.overview.subject[0] || record.original_filename}</span>
                  <time className="shrink-0 text-xs text-slate-500">{new Date(record.uploaded_at).toLocaleDateString()}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
