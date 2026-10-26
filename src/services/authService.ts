import type { User } from '@/types';

type ApiRole = 'employee' | 'soc_analyst' | 'organization_admin';

interface ApiUser {
  id: string;
  full_name: string;
  email: string;
  role: ApiRole;
  organization_id: string;
  organization_name: string;
  account_status: 'active' | 'invited' | 'disabled';
}

interface ApiErrorResponse {
  detail?: string | Array<{ msg?: string }>;
}

async function responseError(response: Response): Promise<Error> {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json() as ApiErrorResponse;
    if (typeof body.detail === 'string') message = body.detail;
    else if (Array.isArray(body.detail)) message = body.detail.map(issue => issue.msg).filter(Boolean).join('; ') || message;
  } catch {
    // Preserve the HTTP status when the response isn't JSON.
  }
  return new Error(message);
}

async function getCsrfToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/auth/csrf', { credentials: 'include' });
  } catch {
    throw new Error('Unable to reach the authentication service. Check the backend and database setup.');
  }
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as { csrf_token: string };
  return result.csrf_token;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const csrfToken = await getCsrfToken();
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach the authentication service. Check the backend and database setup.');
  }
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function mapUser(user: ApiUser): User {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role === 'organization_admin' ? 'org_admin' : user.role,
    organization: user.organization_name,
    avatarInitials: user.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join(''),
    organizationId: user.organization_id,
    accountStatus: user.account_status,
  };
}

export const authService = {
  async register(fullName: string, email: string, password: string): Promise<void> {
    await post('/api/auth/register', { full_name: fullName, email, password });
  },

  async registerWithInvitation(fullName: string, email: string, password: string, invitationToken: string): Promise<void> {
    await post('/api/auth/register/invited', {
      full_name: fullName,
      email,
      password,
      invitation_token: invitationToken,
    });
  },

  async createAnalystInvitation(email: string): Promise<{ email: string; role: 'soc_analyst'; invitation_token: string; expires_at: string }> {
    return post('/api/admin/invitations', { email, role: 'soc_analyst' });
  },

  async assignRole(email: string, role: User['role']): Promise<void> {
    const apiRole = role === 'org_admin' ? 'organization_admin' : role;
    await post('/api/admin/role-assignments', { email, role: apiRole });
  },

  async login(email: string, password: string, expectedRole?: User['role']): Promise<User> {
    const apiExpectedRole = expectedRole === 'org_admin' ? 'organization_admin' : expectedRole;
    await post('/api/auth/login', {
      email,
      password,
      ...(apiExpectedRole ? { expected_role: apiExpectedRole } : {}),
    });
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Sign-in could not be verified. Please try again.');
    return user;
  },

  async getCurrentUser(): Promise<User | null> {
    let response: Response;
    try {
      response = await fetch('/api/auth/me', { credentials: 'include' });
    } catch {
      throw new Error('Unable to reach the authentication service.');
    }
    if (response.status === 401) return null;
    if (!response.ok) throw await responseError(response);
    return mapUser(await response.json() as ApiUser);
  },

  async logout(): Promise<void> {
    await post<void>('/api/auth/logout');
  },
};
