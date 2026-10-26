import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, ChevronRight, Menu, RefreshCw, Search, LogOut, ChevronDown } from 'lucide-react';
import type { Notification, User as UserType } from '@/types';
import { formatRelativeTime } from '@/utils';
import type { Theme } from '@/hooks/useTheme';
import { Moon, Sun } from 'lucide-react';

interface TopNavProps {
  notifications: Notification[];
  onMarkAllRead: () => void;
  user: UserType;
  onMobileMenuToggle: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onLogout: () => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
}

const PAGE_LABELS: Record<string, string> = {
  '/': 'Overview',
  '/analyze': 'Analyze Email',
  '/review': 'Email Reviews',
  '/investigation-queue': 'Investigation Queue',
  '/investigations': 'Investigations',
  '/evidence': 'Evidence Explorer',
  '/threat-intelligence': 'Threat Intelligence',
  '/correlation': 'Correlation Graph',
  '/geolocation': 'Geolocation & Network',
  '/reports': 'Reports',
  '/integrations': 'Integrations',
  '/organization': 'Organization & Audit',
  '/settings': 'Settings',
  '/history': 'My History',
  '/profile': 'Profile',
  '/user-roles': 'User/Roles Management',
  '/policies': 'Policies',
  '/audit-logs': 'Audit Logs',
};

const ROLE_LABELS: Record<string, string> = {
  soc_analyst: 'SOC Analyst',
  employee: 'Employee',
  org_admin: 'Org Admin',
};

export default function TopNav({ notifications, onMarkAllRead, user, onMobileMenuToggle, onRefresh, isRefreshing, onLogout, theme, onToggleTheme }: TopNavProps) {
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [search, setSearch] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  const pagePath = Object.keys(PAGE_LABELS)
    .filter(k => k !== '/')
    .find(k => location.pathname.startsWith(k)) ?? (location.pathname === '/' ? '/' : null);
  const pageLabel = pagePath ? PAGE_LABELS[pagePath] : 'Overview';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    setLogoutError('');
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b border-teal-900/30" style={{ background: 'var(--app-bg)' }}>
      <button
        className="lg:hidden text-slate-400 hover:text-teal-300 transition-colors"
        onClick={onMobileMenuToggle}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <div className="hidden sm:flex items-center gap-1.5 text-sm min-w-0">
        <Link to="/" className="text-slate-500 hover:text-teal-400 transition-colors">Security</Link>
        <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
        <span className="text-slate-200 font-medium truncate">{pageLabel}</span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search emails, IOCs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 pr-3 py-1.5 rounded-lg text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 w-52"
          style={{ background: 'var(--surface-bg)', border: '1px solid rgba(20,184,166,0.15)' }}
        />
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 hover:bg-teal-500/10 transition-colors border border-teal-500/20"
        disabled={isRefreshing}
      >
        <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">Refresh</span>
      </button>

      <button onClick={onToggleTheme} className="p-2 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/5 transition-colors" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      {/* Notifications */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => { setNotifOpen(o => !o); setProfileOpen(false); }}
          className="relative p-2 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/5 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden border border-teal-900/40"
            style={{ background: 'var(--surface-bg)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-teal-900/30">
              <span className="text-sm font-semibold text-slate-200">Notifications</span>
              {unread > 0 && (
                <button onClick={onMarkAllRead} className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500 text-sm">No notifications</div>
              ) : notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 border-b border-teal-900/20 last:border-0 ${!n.read ? 'bg-teal-500/5' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      n.type === 'alert' ? 'bg-red-400' :
                      n.type === 'success' ? 'bg-teal-400' : 'bg-blue-400'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{formatRelativeTime(n.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Profile */}
      <div ref={profileRef} className="relative">
        <button
          onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-teal-500/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-teal-300 border border-teal-600/40 flex-shrink-0"
            style={{ background: 'var(--card-bg)' }}>
            {user.avatarInitials}
          </div>
          <div className="hidden md:block text-left min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate max-w-[120px]">{user.name}</div>
            <div className="text-[10px] text-slate-500">{ROLE_LABELS[user.role]}</div>
          </div>
          <ChevronDown size={12} className="text-slate-500 hidden md:block" />
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-2xl z-50 overflow-hidden border border-teal-900/40"
            style={{ background: 'var(--surface-bg)' }}>
            <div className="px-4 py-3 border-b border-teal-900/30">
              <div className="text-sm font-medium text-slate-200">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            {logoutError && <p role="alert" className="px-4 py-2 text-xs text-red-300">{logoutError}</p>}
            <button
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={14} />
              {isLoggingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
