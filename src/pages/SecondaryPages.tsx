import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Search, Globe2, FileText, Plug, Building2, Settings, GitBranch, Shield, History, UserRound, Users, ShieldCheck, ScrollText, LoaderCircle, Copy } from 'lucide-react';
import { MOCK_IOCS } from '@/data/mockData';
import { authService } from '@/services/authService';
import type { User } from '@/types';

export function EvidenceExplorer() {
  const [query, setQuery] = useState('');
  const results = MOCK_IOCS.filter(ioc => ioc.value.toLowerCase().includes(query.toLowerCase()) || ioc.type.includes(query.toLowerCase()));
  return <PageFrame title="Evidence Explorer" subtitle="Search across extracted indicators and original evidence."><div className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}><div className="relative max-w-md mb-4"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search domains, IPs, hashes..." className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--app-bg)] border border-teal-900/30 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-400" /></div><div className="space-y-2">{results.map(ioc => <div key={ioc.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--app-bg)] border border-teal-900/20"><span className="text-[10px] uppercase text-teal-400 w-14">{ioc.type}</span><span className="font-mono text-xs text-slate-300 flex-1 truncate">{ioc.value}</span><span className="text-[10px] text-slate-500">{ioc.caseId}</span><span className={ioc.verdict === 'malicious' ? 'text-red-400 text-[10px]' : 'text-amber-400 text-[10px]'}>{ioc.verdict}</span></div>)}</div></div></PageFrame>;
}

export function CorrelationGraph() { return <PageFrame title="Correlation Graph" subtitle="Explore relationships between observed evidence and analytical findings."><div className="rounded-xl border border-teal-900/30 p-6 min-h-[480px] relative overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}><div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#14B8A6 1px, transparent 1px)', backgroundSize: '28px 28px' }} /><div className="relative h-[390px] max-w-3xl mx-auto"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border-2 border-teal-400/60 theme-surface flex flex-col items-center justify-center text-center shadow-[0_0_40px_rgba(20,184,166,.15)]"><MailIcon /><span className="text-xs text-teal-300 mt-1">Email</span><span className="text-[9px] text-slate-500">Observed fact</span></div>{[['Sender', 'top-10 left-1/2', 'text-amber-400'], ['Domain', 'top-1/2 right-8', 'text-red-400'], ['Sending IP', 'bottom-8 left-1/2', 'text-blue-400'], ['URL', 'top-1/2 left-8', 'text-red-400'], ['Attachment hash', 'bottom-14 right-20', 'text-purple-400']].map(([label, position, color], i) => <div key={label} className={`absolute ${position} -translate-x-1/2 -translate-y-1/2 w-24 h-16 rounded-lg border border-teal-900/40 theme-card flex flex-col items-center justify-center text-center`}><GitBranch size={13} className={color} /><span className="text-[10px] text-slate-300 mt-1">{label}</span><span className="text-[9px] text-slate-600">{i % 2 ? 'Intelligence' : 'Observed'}</span></div>)}<svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 50 L50 10 M50 50 L92 50 M50 50 L50 90 M50 50 L8 50 M50 50 L82 83" stroke="#14B8A6" strokeOpacity=".35" strokeDasharray="2 2" fill="none" /></svg></div><p className="relative text-center text-xs text-slate-500">Relationships are investigative context, not proof of shared control. A shared IP or domain alone does not establish attribution.</p></div></PageFrame>; }

function MailIcon() { return <span className="text-lg">@</span>; }

type SimplePageType =
  | 'geolocation'
  | 'reports'
  | 'integrations'
  | 'organization'
  | 'settings'
  | 'history'
  | 'profile'
  | 'userRoles'
  | 'policies'
  | 'auditLogs';

export function UserRolesManagement({ isDemo }: { isDemo: boolean }) {
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitation, setInvitation] = useState<{ email: string; invitation_token: string; expires_at: string } | null>(null);
  const [assignmentEmail, setAssignmentEmail] = useState('');
  const [assignmentRole, setAssignmentRole] = useState<Extract<User['role'], 'soc_analyst' | 'org_admin'>>('soc_analyst');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (isDemo) {
    return <SimplePage type="userRoles" />;
  }

  const issueInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await authService.createAnalystInvitation(invitationEmail);
      setInvitation(result);
      setNotice(`SOC Analyst invitation created for ${result.email}. Share this token with the invited user; it expires ${new Date(result.expires_at).toLocaleString()}.`);
      setInvitationEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the invitation.');
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await authService.assignRole(assignmentEmail, assignmentRole);
      setNotice(`Assigned ${assignmentRole === 'org_admin' ? 'Organization Admin' : 'SOC Analyst'} to ${assignmentEmail}.`);
      setAssignmentEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not assign the role.');
    } finally {
      setBusy(false);
    }
  };

  const copyInvitation = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invitation_token);
      setNotice('Invitation token copied.');
    } catch {
      setError('Could not copy the invitation token. Select and copy it manually.');
    }
  };

  return (
    <PageFrame title="User/Roles Management" subtitle="Provision organization access using server-authorized actions.">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-slate-300">
        Role changes apply only within your organization and are enforced by the backend. Never share invitation tokens outside the intended email recipient.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={event => void issueInvitation(event)} className="space-y-4 rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Invite SOC Analyst</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Creates an email-bound, single-use invitation that expires in seven days.</p>
          </div>
          <label className="block text-sm text-slate-300" htmlFor="invite-analyst-email">
            Email address
            <input id="invite-analyst-email" type="email" required value={invitationEmail} onChange={event => setInvitationEmail(event.currentTarget.value)} className="entry-input mt-2" />
          </label>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <LoaderCircle size={15} className="animate-spin" />} Issue SOC Analyst invitation
          </button>
          {invitation && (
            <label className="block text-xs text-slate-400" htmlFor="invitation-token">
              One-time invitation token
              <span className="mt-2 flex gap-2">
                <input id="invitation-token" readOnly value={invitation.invitation_token} className="entry-input min-w-0 flex-1 font-mono text-xs" />
                <button type="button" onClick={() => void copyInvitation()} className="rounded-lg border border-slate-700 px-3 text-slate-300" aria-label="Copy invitation token">
                  <Copy size={15} />
                </button>
              </span>
            </label>
          )}
        </form>
        <form onSubmit={event => void assignRole(event)} className="space-y-4 rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Provision an existing account</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Assign a privileged role to an existing user in this organization. New admins must first register as Employees.</p>
          </div>
          <label className="block text-sm text-slate-300" htmlFor="provision-email">
            Existing account email
            <input id="provision-email" type="email" required value={assignmentEmail} onChange={event => setAssignmentEmail(event.currentTarget.value)} className="entry-input mt-2" />
          </label>
          <label className="block text-sm text-slate-300" htmlFor="provision-role">
            Assigned role
            <select id="provision-role" value={assignmentRole} onChange={event => setAssignmentRole(event.currentTarget.value === 'org_admin' ? 'org_admin' : 'soc_analyst')} className="entry-input mt-2">
              <option value="soc_analyst">SOC Analyst</option>
              <option value="org_admin">Organization Admin</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <LoaderCircle size={15} className="animate-spin" />} Assign role
          </button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-3 py-2 text-sm text-teal-200">{notice}</p>}
      <p className="text-xs leading-5 text-slate-500">The first Organization Admin is created with <code>python create_admin.py</code> in the backend directory after migrations. This page cannot bootstrap an administrator.</p>
    </PageFrame>
  );
}

export function SimplePage({ type }: { type: SimplePageType }) {
  const config = {
    geolocation: {
      title: 'Geolocation & Network Context',
      subtitle: 'Approximate network context for observed sending infrastructure.',
      icon: Globe2,
      body: 'IP geolocation is approximate context, not proof of a physical attacker location.',
      status: 'Context view only; provider-backed geolocation is not connected.',
    },
    reports: {
      title: 'Reports',
      subtitle: 'Prepare shareable summaries for security and leadership teams.',
      icon: FileText,
      body: 'This prototype has no report generation or export service connected.',
      status: 'Report generation is not implemented.',
    },
    integrations: {
      title: 'Integrations',
      subtitle: 'Connect authorized mail, identity, and threat intelligence systems.',
      icon: Plug,
      body: 'Backend connectors will be configured here when authorized integrations are available.',
      status: 'No external service is connected.',
    },
    organization: {
      title: 'Organization & Audit',
      subtitle: 'Review workspace roles, access, and activity history.',
      icon: Building2,
      body: 'The demo workspace has sample role profiles. Production authorization requires a backend identity provider.',
      status: 'Organization data is sample content only.',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Tune detection preferences and workspace behavior.',
      icon: Settings,
      body: 'Settings are displayed for the frontend prototype and are not persisted to a production service.',
      status: 'No production settings service is connected.',
    },
    history: {
      title: 'My History',
      subtitle: 'Review your past email decisions and analysis activity.',
      icon: History,
      body: 'Personal review history is not implemented. Current review decisions exist only in shared in-memory demo data.',
      status: 'No personal history is available in this prototype.',
    },
    profile: {
      title: 'Profile',
      subtitle: 'View your EmailTraceX account profile.',
      icon: UserRound,
      body: 'The current profile is a sample demo user and is not backed by an identity provider.',
      status: 'Profile editing and identity verification are not connected.',
    },
    userRoles: {
      title: 'User/Roles Management',
      subtitle: 'Manage organization membership and assigned roles.',
      icon: Users,
      body: 'This prototype has no user administration or server-side role management.',
      status: 'Role assignments are not available here.',
    },
    policies: {
      title: 'Policies',
      subtitle: 'Review organization email security and response policies.',
      icon: ShieldCheck,
      body: 'Policy configuration is not implemented in this prototype.',
      status: 'No organization policy data is connected.',
    },
    auditLogs: {
      title: 'Audit Logs',
      subtitle: 'Review a record of administrative and security activity.',
      icon: ScrollText,
      body: 'There is no persistent audit log or audit API connected.',
      status: 'Audit events are not available in this prototype.',
    },
  }[type];
  const Icon = config.icon;

  return (
    <PageFrame title={config.title} subtitle={config.subtitle}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-teal-900/30 p-6" style={{ background: 'var(--card-bg)' }}>
          <Icon size={22} className="mb-4 text-teal-400" />
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Prototype workspace</h2>
          <p className="text-sm leading-relaxed text-slate-400">{config.body}</p>
        </div>
        <div className="rounded-xl border border-teal-900/30 p-6" style={{ background: 'var(--surface-bg)' }}>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Current status</h2>
          <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
            <Shield size={13} className="mt-0.5 shrink-0 text-teal-400" />
            {config.status}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function PageFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <div className="space-y-6 max-w-5xl"><div><h1 className="text-xl font-bold text-white">{title}</h1><p className="text-sm text-slate-400 mt-1">{subtitle}</p></div>{children}</div>; }
