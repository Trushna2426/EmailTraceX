import type { EmailPrediction, UploadedEmailRecord } from '@/services/emailUploadService';

export interface InvestigationQueueEmail {
  id: string;
  subject: string;
  sender: string;
  uploadedAt: string;
  prediction: EmailPrediction | null;
}

function isEmailPrediction(value: unknown): value is EmailPrediction {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Partial<EmailPrediction>;
  return (
    (result.predicted_class === 'phishing'
      || result.predicted_class === 'legitimate'
      || result.predicted_class === 'inconclusive')
    && typeof result.phishing_score === 'number'
    && result.phishing_score >= 0
    && result.phishing_score <= 1
    && result.score_type === 'uncalibrated_model_score'
    && typeof result.model_version === 'string'
    && Array.isArray(result.explanation)
    && result.explanation.every(item => typeof item === 'string')
    && result.confirmed_finding === false
    && typeof result.review_recommended === 'boolean'
  );
}

export function mapInvestigationEmail(record: UploadedEmailRecord): InvestigationQueueEmail {
  const subject = record.parsed?.overview?.subject?.find(value => typeof value === 'string' && value.trim());
  const sender = record.parsed?.participants?.from?.find(value => typeof value === 'string' && value.trim());
  return {
    id: record.id,
    subject: subject || '(No subject)',
    sender: sender || 'Sender unavailable',
    uploadedAt: record.uploaded_at,
    prediction: isEmailPrediction(record.prediction) ? record.prediction : null,
  };
}
