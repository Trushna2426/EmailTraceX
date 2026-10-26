import assert from 'node:assert/strict';
import test from 'node:test';
import { emailUploadService } from './emailUploadService.ts';
import type { UploadedEmailRecord } from './emailUploadService.ts';

function record(id: string): UploadedEmailRecord {
  return {
    id,
    original_filename: 'pasted-email',
    uploaded_at: '2026-10-25T10:00:00+00:00',
    submitted_by_user_id: 'user-id',
    parsed: {
      overview: { subject: ['Persisted subject'], date: null, message_id: [], return_path: [] },
      participants: { from: ['sender@example.test'], to: [], cc: [], reply_to: [] },
      headers: [],
      routing: { received: [] },
      authentication_headers: [],
      mime: { parts: [], html_available: false },
      attachments: [],
      urls: [],
      plain_text_preview: 'message',
      plain_text_truncated: false,
      warnings: [],
    },
    prediction: null,
  };
}

test('list follows backend pagination until all persisted records are returned', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async input => {
    const path = String(input);
    requests.push(path);
    const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset'));
    const items = offset === 0
      ? Array.from({ length: 100 }, (_, index) => record(`record-${index}`))
      : [record('record-100')];
    return new Response(JSON.stringify({ items, limit: 100, offset }), { status: 200 });
  };
  try {
    const records = await emailUploadService.list();
    assert.equal(records.length, 101);
    assert.equal(requests[0], '/api/emails?limit=100&offset=0');
    assert.equal(requests[1], '/api/emails?limit=100&offset=100');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('list returns empty results without fabricating email records', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [], limit: 100, offset: 0 }), { status: 200 });
  try {
    assert.deepEqual(await emailUploadService.list(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('list reports backend API errors to the queue caller', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Email service unavailable.' }), { status: 503 });
  try {
    await assert.rejects(emailUploadService.list(), /Email service unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('paste sends the raw email with CSRF protection and returns the persisted record', async () => {
  const originalFetch = globalThis.fetch;
  const rawEmail = 'From: sender@example.test\nSubject: Test\n\nBody';
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    calls.push({ path, init });
    if (path === '/api/auth/csrf') {
      return new Response(JSON.stringify({ csrf_token: 'csrf-test' }), { status: 200 });
    }
    return new Response(JSON.stringify(record('saved-id')), { status: 201 });
  };
  try {
    const saved = await emailUploadService.paste(rawEmail);
    assert.equal(saved.id, 'saved-id');
    assert.equal(calls[1].path, '/api/emails/paste');
    assert.equal(calls[1].init?.body, rawEmail);
    assert.equal(new Headers(calls[1].init?.headers).get('X-CSRF-Token'), 'csrf-test');
    assert.match(new Headers(calls[1].init?.headers).get('Content-Type') ?? '', /^text\/plain/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
