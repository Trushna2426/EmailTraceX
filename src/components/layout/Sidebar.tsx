import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ClipboardList, FileText, History,
  Inbox, LayoutDashboard, Plug, Radar, ScrollText, Search, Settings,
  ShieldAlert, ShieldCheck, UserRound, Users, X,
} from 'lucide-react';
import type { User } from '@/types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: User;
  isDemo: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavigationItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
}

const WORKSPACE_ITEMS: Record<User['role'], NavigationItem[]> = {
  employee: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Email Reviews', icon: Inbox, path: '/review' },
    { label: 'My History', icon: History, path: '/history' },
    { label: 'Reports', icon: FileText, path: '/reports' },
  ],
  soc_analyst: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Investigation Queue', icon: ClipboardList, path: '/investigation-queue' },
    { label: 'Cases', icon: Search, path: '/investigations' },
    { label: 'Threat Intelligence', icon: Radar, path: '/threat-intelligence' },
    { label: 'Reports', icon: FileText, path: '/reports' },
  ],
  org_admin: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'User/Roles Management', icon: Users, path: '/user-roles' },
    { label: 'Policies', icon: ShieldCheck, path: '/policies' },
    { label: 'Integrations', icon: Plug, path: '/integrations' },
    { label: 'Audit Logs', icon: ScrollText, path: '/audit-logs' },
  ],
};

const ACCOUNT_ITEMS: Record<User['role'], NavigationItem[]> = {
  employee: [{ label: 'Profile', icon: UserRound, path: '/profile' }],
  soc_analyst: [{ label: 'Profile', icon: UserRound, path: '/profile' }],
  org_admin: [{ label: 'Settings', icon: Settings, path: '/settings' }],
};

const ROLE_LABELS: Record<User['role'], string> = {
  soc_analyst: 'SOC Analyst',
  employee: 'Employee',
  org_admin: 'Organization Admin',
};

export default function Sidebar({ collapsed, onToggle, user, isDemo, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();

  const renderItems = (items: NavigationItem[]) => items.map(item => {
    const isActive = item.path === '/'
      ? location.pathname === '/'
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onMobileClose}
        title={collapsed ? item.label : undefined}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all
          ${isActive ? 'bg-teal-500/10 text-teal-300' : 'text-slate-400 hover:bg-teal-500/5 hover:text-teal-300'}
          ${collapsed ? 'justify-center' : ''}`}
      >
        {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-teal-400" />}
        <item.icon size={16} className="shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {item.label}
          </span>
        )}
      </NavLink>
    );
  });

  const sidebarContent = (
    <div className="flex h-full flex-col" style={{ background: 'var(--sidebar-bg)' }}>
      <div className={`flex items-center gap-3 border-b border-teal-900/40 px-4 py-4 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg, #14B8A6, #0d9488)' }}>
          <ShieldAlert size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate">
              <span className="text-base font-bold tracking-wide text-white">EmailTrace</span>
              <span className="text-base font-bold text-teal-300">X</span>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-[.16em] text-amber-400">{isDemo ? 'Demo workspace' : 'Authenticated workspace'}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-teal-300 lg:flex ${collapsed ? '' : 'ml-auto'}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4" aria-label="Primary navigation">
        <section>
          {!collapsed && <h2 className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Workspace</h2>}
          <div className="space-y-0.5">{renderItems(WORKSPACE_ITEMS[user.role])}</div>
        </section>
        <section>
          {!collapsed && <h2 className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Account</h2>}
          <div className="space-y-0.5">{renderItems(ACCOUNT_ITEMS[user.role])}</div>
        </section>
      </nav>

      <div className={`border-t border-teal-900/40 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-600/40 text-xs font-bold text-teal-300"
            style={{ background: 'var(--card-bg)' }}
            title={`${user.name} · ${ROLE_LABELS[user.role]}${isDemo ? ' · Demo workspace' : ''}`}
          >
            {user.avatarInitials}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-600/40 text-xs font-bold text-teal-300" style={{ background: 'var(--card-bg)' }}>
              {user.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-200">{user.name}</div>
              <div className="truncate text-xs text-slate-500">{ROLE_LABELS[user.role]}{isDemo ? ' · Demo' : ''}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 h-full w-full bg-black/60" onClick={onMobileClose} aria-label="Close navigation" />
          <div className="absolute bottom-0 left-0 top-0 z-50 w-64">
            <button type="button" className="absolute right-4 top-4 z-10 text-slate-400 hover:text-white" onClick={onMobileClose} aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <aside
        className="hidden h-full shrink-0 flex-col border-r border-teal-900/30 transition-all duration-300 lg:flex"
        style={{ width: collapsed ? '64px' : '232px', background: 'var(--sidebar-bg)' }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
