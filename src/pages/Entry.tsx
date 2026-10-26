import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Eye, EyeOff, LoaderCircle, Moon,
  ShieldAlert, ShieldCheck, Sun, UserRound,
} from 'lucide-react';
import type { User } from '@/types';
import { DEMO_USERS } from '@/data/mockData';
import { authService } from '@/services/authService';
import { useTheme } from '@/hooks/useTheme';
import { validateRegistrationPassword } from '@/utils/passwordPolicy';

interface EntryProps {
  onLogin: (user: User) => void;
  onAuthenticated: (user: User) => void;
  initialError?: string;
}

type EntryView = 'login' | 'register' | 'demo';

const LOGIN_ROLES: { role: User['role']; title: string; description: string; Icon: typeof UserRound }[] = [
  { role: 'employee', title: 'Employee', description: 'Review suspicious messages and reports.', Icon: UserRound },
  { role: 'soc_analyst', title: 'SOC Analyst', description: 'Triage threats and investigate cases.', Icon: ShieldCheck },
  { role: 'org_admin', title: 'Organization Admin', description: 'Manage workspace settings and access.', Icon: Building2 },
];

function NetworkMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-300/25 bg-teal-400/10">
      <ShieldAlert size={23} className="text-teal-300" />
    </div>
  );
}

export default function Entry({ onLogin, onAuthenticated, initialError = '' }: EntryProps) {
  const [view, setView] = useState<EntryView>('demo');
  const [selectedRole, setSelectedRole] = useState<User['role'] | null>(null);
  const [registrationRole, setRegistrationRole] = useState<User['role']>('employee');
  const [invitationToken, setInvitationToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(initialError);
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('error');
  const { theme, toggleTheme } = useTheme();
  const selectedRoleInfo = LOGIN_ROLES.find(item => item.role === selectedRole);

  useEffect(() => {
    if (initialError) {
      setMessage(initialError);
      setMessageKind('error');
    }
  }, [initialError]);

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>, action: 'sign-in' | 'registration') => {
    event.preventDefault();
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    if (action === 'registration' && registrationRole === 'org_admin') {
      setMessage('Organization Admin accounts cannot be created through public registration. Ask an existing Organization Admin to provision this account. The first admin must be created with the backend bootstrap procedure.');
      setMessageKind('error');
      return;
    }
    if (action === 'registration' && registrationRole === 'soc_analyst' && !invitationToken.trim()) {
      setMessage('SOC Analyst access requires an invitation from an authorized Organization Admin. Enter your invitation token or contact your administrator.');
      setMessageKind('error');
      return;
    }
    if (!form.reportValidity()) return;

    if (action === 'registration') {
      const passwordIssue = validateRegistrationPassword(String(data.get('password')));
      if (passwordIssue) {
        setMessage(passwordIssue);
        setMessageKind('error');
        return;
      }
      if (data.get('password') !== data.get('confirmPassword')) {
        setMessage('Passwords do not match.');
        setMessageKind('error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (action === 'sign-in') {
        const authenticatedUser = await authService.login(
          String(data.get('email')),
          String(data.get('password')),
          selectedRole ?? undefined,
        );
        setIsSubmitting(false);
        onAuthenticated(authenticatedUser);
        return;
      }
      const fullName = String(data.get('fullName'));
      const email = String(data.get('email'));
      const password = String(data.get('password'));
      if (registrationRole === 'soc_analyst') {
        await authService.registerWithInvitation(fullName, email, password, invitationToken.trim());
        setMessage('SOC Analyst account created for this organization. You can now sign in.');
      } else {
        await authService.register(fullName, email, password);
        setMessage('Employee account created. You can now sign in.');
      }
      setSelectedRole(registrationRole);
      setMessageKind('success');
      setInvitationToken('');
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request could not be completed.');
      setMessageKind('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoEntry = () => {
    const demoUser = DEMO_USERS.find(user => user.role === selectedRole);
    if (!demoUser) {
      setMessage('Demo access is not configured for this role.');
      return;
    }
    onLogin(demoUser);
  };

  const continueToSignIn = () => {
    if (!selectedRole) return;
    navigate('login');
  };

  const navigate = (nextView: EntryView) => {
    setMessage('');
    setView(nextView);
  };

  return (
    <main className="entry-shell min-h-screen lg:grid lg:grid-cols-[1fr_0.92fr]" style={{ background: 'var(--app-bg)' }}>
      <section className="entry-hero relative flex min-h-[380px] flex-col justify-between overflow-hidden px-6 py-7 sm:px-10 lg:min-h-screen lg:px-12 lg:py-10">
        <img
          src="/images/digital-forensics-centre.png"
          alt="Centre of Excellence in Digital Forensics, Maharashtra State"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#041515]/95 via-[#041515]/80 to-[#062a28]/75" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'linear-gradient(rgba(45,226,209,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(45,226,209,.15) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }} />

        <div className="relative flex items-center gap-3">
          <NetworkMark />
          <div>
            <div className="text-lg font-bold tracking-wide text-white">EmailTrace<span className="text-teal-300">X</span></div>
            <div className="text-xs text-teal-100/80">Security workspace</div>
          </div>
        </div>

        <div className="relative my-10 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-300">Email Threat Intelligence &amp; Digital Forensics</p>
          <h1 className="mt-5 max-w-lg text-3xl font-bold leading-tight text-white sm:text-4xl xl:text-5xl">
            Investigate threats. Trace evidence. Protect communication.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-200">
            An evidence-first workspace for understanding suspicious email, following digital indicators, and coordinating security investigations.
          </p>
        </div>

        <div className="relative flex items-end justify-between gap-4">
          <div className="max-w-xs text-[11px] leading-4 text-slate-300">
            Facility photography supplied for this project. It is illustrative and does not imply affiliation or endorsement.
          </div>
          <figure className="w-28 shrink-0 overflow-hidden rounded-lg border border-white/25 shadow-xl sm:w-36">
            <img
              src="/images/cyber-operations-centre.png"
              alt="Police cyber operations centre with staff monitoring workstations"
              className="h-20 w-full object-cover sm:h-24"
            />
            <figcaption className="bg-[#041515]/90 px-2 py-1 text-[9px] text-slate-200">Cyber operations centre</figcaption>
          </figure>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-8 sm:px-10 lg:min-h-screen lg:px-12 lg:py-12">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute right-5 top-5 rounded-lg p-2 text-slate-400 transition-colors hover:bg-teal-500/10 hover:text-teal-300 sm:right-8 sm:top-7"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <NetworkMark />
            <div className="text-lg font-bold text-white">EmailTrace<span className="text-teal-300">X</span></div>
          </div>

          {view === 'login' && (
            <>
              <button type="button" onClick={() => navigate('demo')} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-teal-300">
                <ArrowLeft size={15} /> Back to Demo Login
              </button>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-400">Secure workspace</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-400">Sign in to continue to your security workspace.</p>
              {selectedRoleInfo && <p className="mt-3 rounded-lg border border-teal-900/30 p-3 text-xs leading-5 text-slate-300">Selected account role: <strong>{selectedRoleInfo.title}</strong>. The server verifies this against the role assigned to your account; it never changes your role.</p>}

              <form className="mt-8 space-y-5" onSubmit={event => handleFormSubmit(event, 'sign-in')}>
                <label className="block text-sm font-medium text-slate-200" htmlFor="login-email">
                  Email address
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="entry-input mt-2"
                    placeholder="you@organization.com"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-200" htmlFor="login-password">
                  Password
                  <span className="relative mt-2 block">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className="entry-input pr-12"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(current => !current)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-teal-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>

                {message && <p role={messageKind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2.5 text-sm ${messageKind === 'error' ? 'border-red-500/25 bg-red-500/5 text-red-300' : 'border-teal-500/25 bg-teal-500/5 text-teal-200'}`}>{message}</p>}

                <button type="submit" disabled={isSubmitting} className="entry-primary-button">
                  {isSubmitting ? <><LoaderCircle size={16} className="animate-spin" /> Signing in...</> : <>Sign In <ArrowRight size={16} /></>}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-400">
                New to EmailTraceX?{' '}
                <button type="button" onClick={() => navigate('register')} className="font-semibold text-teal-300 hover:text-teal-200">
                  Create Account
                </button>
              </p>

            </>
          )}

          {view === 'register' && (
            <>
              <button type="button" onClick={() => navigate('login')} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-teal-300">
                <ArrowLeft size={15} /> Back to Sign In
              </button>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-400">New account</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Create Account</h2>
              <p className="mt-2 text-sm text-slate-400">Request access to your organization’s security workspace.</p>

              <form className="mt-6 space-y-4" onSubmit={event => handleFormSubmit(event, 'registration')}>
                <label className="block text-sm font-medium text-slate-200" htmlFor="register-role">
                  Account access
                  <select
                    id="register-role"
                    value={registrationRole}
                    onChange={event => {
                      const selected = LOGIN_ROLES.find(item => item.role === event.currentTarget.value);
                      if (selected) setRegistrationRole(selected.role);
                      setInvitationToken('');
                      setMessage('');
                    }}
                    className="entry-input mt-2"
                  >
                    <option value="employee">Employee — self-registration</option>
                    <option value="soc_analyst">SOC Analyst — invitation required</option>
                    <option value="org_admin">Organization Admin — administrator provisioned</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-200" htmlFor="register-name">
                  Full name
                  <input id="register-name" name="fullName" type="text" autoComplete="name" required minLength={2} className="entry-input mt-2" placeholder="Your full name" />
                </label>
                <label className="block text-sm font-medium text-slate-200" htmlFor="register-email">
                  Email address
                  <input id="register-email" name="email" type="email" autoComplete="email" required className="entry-input mt-2" placeholder="you@organization.com" />
                </label>
                {registrationRole === 'soc_analyst' && (
                  <label className="block text-sm font-medium text-slate-200" htmlFor="register-invitation">
                    SOC Analyst invitation token
                    <input
                      id="register-invitation"
                      name="invitationToken"
                      type="text"
                      autoComplete="off"
                      value={invitationToken}
                      onChange={event => setInvitationToken(event.currentTarget.value)}
                      className="entry-input mt-2"
                      placeholder="Enter the token from your administrator"
                    />
                  </label>
                )}
                <label className="block text-sm font-medium text-slate-200" htmlFor="register-password">
                  Password
                  <input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} className="entry-input mt-2" placeholder="At least 8 characters" />
                </label>
                <label className="block text-sm font-medium text-slate-200" htmlFor="register-confirm-password">
                  Confirm password
                  <input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} className="entry-input mt-2" placeholder="Re-enter your password" />
                </label>

                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-slate-300">
                  {registrationRole === 'employee' && 'Employee accounts can be created here. Public registration cannot grant privileged access.'}
                  {registrationRole === 'soc_analyst' && 'An authorized Organization Admin must issue a valid, email-bound invitation. Without it, no account will be created.'}
                  {registrationRole === 'org_admin' && 'Admin access is never self-assigned. The initial administrator must use backend\\create_admin.py; additional admins must be provisioned by an existing Organization Admin.'}
                </div>
                {message && <p role={messageKind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2.5 text-sm ${messageKind === 'error' ? 'border-red-500/25 bg-red-500/5 text-red-300' : 'border-teal-500/25 bg-teal-500/5 text-teal-200'}`}>{message}</p>}

                <button type="submit" disabled={isSubmitting || registrationRole === 'org_admin'} className="entry-primary-button">
                  {isSubmitting ? <><LoaderCircle size={16} className="animate-spin" /> Creating account...</> : registrationRole === 'soc_analyst' ? <>Accept Invitation <ArrowRight size={16} /></> : <>Create Employee Account <ArrowRight size={16} /></>}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-slate-400">
                Already have an account?{' '}
                <button type="button" onClick={() => navigate('login')} className="font-semibold text-teal-300 hover:text-teal-200">Sign In</button>
              </p>
            </>
          )}

          {view === 'demo' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-400">Sample workspace</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Choose your workspace</h2>
              <p className="mt-2 text-sm leading-5 text-slate-400">
                Choose a role for the sample demo, or continue to sign in. Real sign-in uses the role assigned to your account.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {LOGIN_ROLES.map(({ role, title, description, Icon }) => {
                  const isSelected = selectedRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => { setSelectedRole(role); setMessage(''); }}
                      aria-pressed={isSelected}
                      className={`flex min-h-32 flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                        isSelected ? 'border-teal-500 bg-teal-500/10' : 'border-teal-900/40 bg-[var(--surface-bg)] hover:border-teal-600/60'
                      }`}
                    >
                      <Icon size={23} className={isSelected ? 'text-teal-300' : 'text-slate-400'} />
                      <span className="mt-2 text-xs font-semibold text-slate-200">{title}</span>
                      <span className="mt-1 text-[10px] leading-4 text-slate-400">{description}</span>
                    </button>
                  );
                })}
              </div>

              {message && <p role="alert" className="mt-4 text-sm text-red-300">{message}</p>}
              <button type="button" onClick={continueToSignIn} disabled={!selectedRole} className="entry-primary-button mt-5">
                Continue to Sign In <ArrowRight size={16} />
              </button>
              <button type="button" onClick={handleDemoEntry} disabled={!selectedRole} className="entry-secondary-button mt-3">
                <ShieldAlert size={16} /> Enter {selectedRoleInfo?.title ?? 'selected'} demo
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                Demo access displays sample data only. The selected role is not used to authenticate real accounts.
              </p>
            </div>
          )}

          <p className="mt-8 text-center text-[11px] text-slate-500">
            Demo access uses sample data. Real sign-in and registration require the authentication service.
          </p>
        </div>
      </section>
    </main>
  );
}
