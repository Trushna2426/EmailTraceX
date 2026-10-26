import assert from 'node:assert/strict';
import test from 'node:test';
import { mapInvestigationEmail } from './emailQueue.ts';
import type { UploadedEmailRecord } from '@/services/emailUploadService';

const email: UploadedEmailRecord = {
  id: 'persisted-id',
  original_filename: 'message.eml',
  uploaded_at: '2026-10-25T10:00:00+00:00',
  submitted_by_user_id: 'analyst-id',
  parsed: {
    overview: { subject: ['Saved subject'], date: null, message_id: [], return_path: [] },
    participants: { from: ['Actual sender <sender@example.test>'], to: [], cc: [], reply_to: [] },
    headers: [],
    routing: { received: [] },
    authentication_headers: [],
    mime: { parts: [], html_available: false },
    attachments: [],
    urls: [],
    plain_text_preview: 'email body',
    plain_text_truncated: false,
    warnings: [],
  },
  prediction: null,
};

test('queue mapping preserves persisted subject, sender, date, and record ID without a prediction', () => {
  assert.deepEqual(mapInvestigationEmail(email), {
    id: 'persisted-id',
    subject: 'Saved subject',
    sender: 'Actual sender <sender@example.test>',
    uploadedAt: '2026-10-25T10:00:00+00:00',
    prediction: null,
  });
});

test('queue mapping exposes an available saved ML prediction', () => {
  const prediction = {
    predicted_class: 'inconclusive' as const,
    phishing_score: 0.51,
    score_type: 'uncalibrated_model_score' as const,
    model_version: 'test-model',
    explanation: ['Text features influenced the score.'],
    confirmed_finding: false as const,
    review_recommended: true,
  };
  const mapped = mapInvestigationEmail({ ...email, prediction });
  assert.equal(mapped.prediction, prediction);
});

test('queue mapping uses clear placeholders when source headers are missing', () => {
  const mapped = mapInvestigationEmail({
    ...email,
    parsed: {
      ...email.parsed,
      overview: { ...email.parsed.overview, subject: [] },
      participants: { ...email.parsed.participants, from: [] },
    },
  });
  assert.equal(mapped.subject, '(No subject)');
  assert.equal(mapped.sender, 'Sender unavailable');
  assert.equal(mapped.prediction, null);
});
