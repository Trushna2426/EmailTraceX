export interface ParsedEmail {
  overview: { subject: string[]; date: string | null; message_id: string[]; return_path: string[] };
  participants: { from: string[]; to: string[]; cc: string[]; reply_to: string[] };
  headers: Array<{ name: string; value: string }>;
  routing: { received: string[] };
  authentication_headers: Array<{ name: string; value: string }>;
  mime: {
    parts: Array<{ content_type: string; disposition: string | null; filename: string | null; decoded_size: number }>;
    html_available: boolean;
  };
  attachments: Array<{ filename: string | null; content_type: string; decoded_size: number }>;
  urls: string[];
  plain_text_preview: string;
  plain_text_truncated: boolean;
  warnings: string[];
}

export interface UploadedEmailRecord {
  id: string;
  original_filename: string;
  uploaded_at: string;
  submitted_by_user_id: string;
  parsed: ParsedEmail;
  prediction: EmailPrediction | null;
}

export interface EmailPrediction {
  predicted_class: 'phishing' | 'legitimate' | 'inconclusive';
  phishing_score: number;
  score_type: 'uncalibrated_model_score';
  model_version: string;
  explanation: string[];
  confirmed_finding: false;
  review_recommended: boolean;
}

interface ApiErrorResponse {
  detail?: string | Array<{ msg?: string }>;
}

async function responseError(response: Response): Promise<Error> {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json() as ApiErrorResponse;
    if (typeof body.detail === 'string') message = body.detail;
    else if (Array.isArray(body.detail)) {
      message = body.detail.map(issue => issue.msg).filter(Boolean).join('; ') || message;
    }
  } catch {
    // Preserve the HTTP status for non-JSON errors.
  }
  return new Error(message);
}

async function getCsrfToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/auth/csrf', { credentials: 'include' });
  } catch {
    throw new Error('Unable to reach the authentication service.');
  }
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as { csrf_token: string };
  return result.csrf_token;
}

export const emailUploadService = {
  async upload(file: File): Promise<UploadedEmailRecord> {
    const token = await getCsrfToken();
    const form = new FormData();
    form.append('file', file);
    let response: Response;
    try {
      response = await fetch('/api/emails/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': token },
        body: form,
      });
    } catch {
      throw new Error('Unable to reach the email service.');
    }
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<UploadedEmailRecord>;
  },

  async paste(rawEmail: string): Promise<UploadedEmailRecord> {
    const token = await getCsrfToken();
    let response: Response;
    try {
      response = await fetch('/api/emails/paste', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-CSRF-Token': token },
        body: rawEmail,
      });
    } catch {
      throw new Error('Unable to reach the email service.');
    }
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<UploadedEmailRecord>;
  },

  async list(): Promise<UploadedEmailRecord[]> {
    const pageSize = 100;
    const allItems = new Map<string, UploadedEmailRecord>();
    let offset = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetch(`/api/emails?limit=${pageSize}&offset=${offset}`, { credentials: 'include' });
      } catch {
        throw new Error('Unable to reach the email service.');
      }
      if (!response.ok) throw await responseError(response);
      const result = await response.json() as { items: UploadedEmailRecord[]; limit: number; offset: number };
      result.items.forEach(item => allItems.set(item.id, item));
      if (result.items.length < pageSize) return [...allItems.values()];
      offset += pageSize;
    }
  },

  async predict(recordId: string): Promise<EmailPrediction> {
    const token = await getCsrfToken();
    let response: Response;
    try {
      response = await fetch(`/api/emails/${encodeURIComponent(recordId)}/prediction`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': token },
      });
    } catch {
      throw new Error('Unable to reach the email analysis service.');
    }
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<EmailPrediction>;
  },
};
