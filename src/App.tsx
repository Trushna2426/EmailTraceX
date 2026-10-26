import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import AnalyzeEmail from '@/pages/AnalyzeEmail';
import ReviewQueue from '@/pages/ReviewQueue';
import Investigations from '@/pages/Investigations';
import InvestigationDetail from '@/pages/InvestigationDetail';
import Entry from '@/pages/Entry';
import { CorrelationGraph, EvidenceExplorer, SimplePage, UserRolesManagement } from '@/pages/SecondaryPages';
import { DEMO_USERS, MOCK_NOTIFICATIONS } from '@/data/mockData';
import type { Notification, User } from '@/types';
import { ThemeProvider } from '@/hooks/useTheme';
import { authService } from '@/services/authService';

function RoleGate({ user, allowedRoles, children }: {
  user: User;
  allowedRoles: User['role'][];
  children: ReactNode;
}) {
  return allowedRoles.includes(user.role) ? children : <Navigate to="/" replace />;
}

function readDemoUser(): User | null {
  try {
    const saved = window.localStorage.getItem('emailtracex-demo-user');
    if (!saved) return null;
    const user = JSON.parse(saved) as User;
    return DEMO_USERS.find(demo => demo.id === user.id && demo.role === user.role) ?? null;
  } catch {
    return null;
  }
}

function AuthenticatedApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'demo' | 'authenticated' | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);

  useEffect(() => {
    let active = true;
    authService.getCurrentUser()
      .then(authenticatedUser => {
        if (!active) return;
        if (authenticatedUser) {
          window.localStorage.removeItem('emailtracex-demo-user');
          setUser(authenticatedUser);
          setAuthMode('authenticated');
        } else {
          const savedDemoUser = readDemoUser();
          setUser(savedDemoUser);
          setAuthMode(savedDemoUser ? 'demo' : null);
        }
      }).catch(error => {
        if (active) {
          setUser(null);
          setAuthMode(null);
          setSessionError(error instanceof Error ? error.message : 'Could not verify your session.');
        }
      })
      .finally(() => { if (active) setIsBootstrapping(false); });
    return () => { active = false; };
  }, []);

  const demoLogin = (nextUser: User) => {
    const demoUser = DEMO_USERS.find(demo => demo.id === nextUser.id && demo.role === nextUser.role);
    if (!demoUser) return;
    setUser(demoUser);
    setAuthMode('demo');
    setSessionError('');
    window.localStorage.setItem('emailtracex-demo-user', JSON.stringify(demoUser));
  };
  const authenticatedLogin = (nextUser: User) => {
    setUser(nextUser);
    setAuthMode('authenticated');
    setSessionError('');
    window.localStorage.removeItem('emailtracex-demo-user');
  };
  const logout = async () => {
    try {
      if (authMode === 'authenticated') await authService.logout();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Sign out could not be confirmed by the authentication service.');
      throw error;
    } finally {
      setUser(null);
      setAuthMode(null);
      window.localStorage.removeItem('emailtracex-demo-user');
    }
  };
  const markAllRead = () => setNotifications(items => items.map(item => ({ ...item, read: true })));

  if (isBootstrapping) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-400" style={{ background: 'var(--app-bg)' }}>Checking your session…</main>;
  }
  if (!user) return <Entry onLogin={demoLogin} onAuthenticated={authenticatedLogin} initialError={sessionError} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout user={user} isDemo={authMode === 'demo'} notifications={notifications} onMarkAllRead={markAllRead} onLogout={logout} />}>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/analyze" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><AnalyzeEmail isDemo={authMode === 'demo'} /></RoleGate>} />
          <Route path="/review" element={<RoleGate user={user} allowedRoles={['employee']}><ReviewQueue user={user} /></RoleGate>} />
          <Route path="/investigation-queue" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><ReviewQueue user={user} /></RoleGate>} />
          <Route path="/investigations" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><Investigations /></RoleGate>} />
          <Route path="/investigations/:id" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><InvestigationDetail /></RoleGate>} />
          <Route path="/evidence" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><EvidenceExplorer /></RoleGate>} />
          <Route path="/threat-intelligence" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><EvidenceExplorer /></RoleGate>} />
          <Route path="/correlation" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><CorrelationGraph /></RoleGate>} />
          <Route path="/geolocation" element={<RoleGate user={user} allowedRoles={['soc_analyst']}><SimplePage type="geolocation" /></RoleGate>} />
          <Route path="/reports" element={<RoleGate user={user} allowedRoles={['employee', 'soc_analyst']}><SimplePage type="reports" /></RoleGate>} />
          <Route path="/integrations" element={<RoleGate user={user} allowedRoles={['org_admin']}><SimplePage type="integrations" /></RoleGate>} />
          <Route path="/organization" element={<RoleGate user={user} allowedRoles={['org_admin']}><SimplePage type="organization" /></RoleGate>} />
          <Route path="/settings" element={<RoleGate user={user} allowedRoles={['org_admin']}><SimplePage type="settings" /></RoleGate>} />
          <Route path="/history" element={<RoleGate user={user} allowedRoles={['employee']}><SimplePage type="history" /></RoleGate>} />
          <Route path="/profile" element={<RoleGate user={user} allowedRoles={['employee', 'soc_analyst']}><SimplePage type="profile" /></RoleGate>} />
          <Route path="/user-roles" element={<RoleGate user={user} allowedRoles={['org_admin']}><UserRolesManagement isDemo={authMode === 'demo'} /></RoleGate>} />
          <Route path="/policies" element={<RoleGate user={user} allowedRoles={['org_admin']}><SimplePage type="policies" /></RoleGate>} />
          <Route path="/audit-logs" element={<RoleGate user={user} allowedRoles={['org_admin']}><SimplePage type="auditLogs" /></RoleGate>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <ThemeProvider><AuthenticatedApp /></ThemeProvider>;
}
