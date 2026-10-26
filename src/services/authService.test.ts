import assert from 'node:assert/strict';
import test from 'node:test';
import { authService, mapUser } from './authService.ts';

const apiUser = {
  id: 'user-id',
  full_name: 'Example User',
  email: 'user@example.com',
  role: 'organization_admin' as const,
  organization_id: 'organization-id',
  organization_name: 'Example Organization',
  account_status: 'active' as const,
};

const expectedRoles = [
  ['employee', 'employee'],
  ['soc_analyst', 'soc_analyst'],
  ['organization_admin', 'org_admin'],
] as const;

test('maps each server-authorized role to its frontend role', () => {
  for (const [apiRole, expectedRole] of expectedRoles) {
    const user = mapUser({
      id: 'user-id',
      full_name: 'Example User',
      email: 'user@example.com',
      role: apiRole,
      organization_id: 'organization-id',
      organization_name: 'Example Organization',
      account_status: 'active',
    });
    assert.equal(user.role, expectedRole);
  }
});

test('session restoration uses the role returned by the server', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(apiUser), { status: 200 });
  try {
    const user = await authService.getCurrentUser();
    assert.equal(user?.role, 'org_admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('login sends selected role only as a server-side mismatch check', async () => {
  const originalFetch = globalThis.fetch;
  const loginBodies: Array<Record<string, string>> = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/auth/csrf') {
      return new Response(JSON.stringify({ csrf_token: 'csrf-test' }), { status: 200 });
    }
    if (path === '/api/auth/login') {
      loginBodies.push(JSON.parse(String(init?.body)) as Record<string, string>);
      return new Response(JSON.stringify({ message: 'Signed in' }), { status: 200 });
    }
    return new Response(JSON.stringify(apiUser), { status: 200 });
  };
  try {
    const user = await authService.login('user@example.com', 'password', 'org_admin');
    assert.equal(loginBodies[0].expected_role, 'organization_admin');
    assert.equal(user.role, 'org_admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('login role mismatch is rejected before a session lookup', async () => {
  const originalFetch = globalThis.fetch;
  let requestedMe = false;
  globalThis.fetch = async input => {
    const path = String(input);
    if (path === '/api/auth/csrf') {
      return new Response(JSON.stringify({ csrf_token: 'csrf-test' }), { status: 200 });
    }
    if (path === '/api/auth/login') {
      return new Response(JSON.stringify({ detail: 'Selected role does not match this account.' }), { status: 403 });
    }
    requestedMe = true;
    return new Response(null, { status: 401 });
  };
  try {
    await assert.rejects(authService.login('user@example.com', 'password', 'org_admin'), /does not match/);
    assert.equal(requestedMe, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
