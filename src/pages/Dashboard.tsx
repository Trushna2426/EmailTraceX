import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Mail, Settings, ShieldCheck, Users } from 'lucide-react';
import SummaryCards from '@/components/dashboard/SummaryCards';
import ThreatTrendsChart from '@/components/dashboard/ThreatTrendsChart';
import RiskDistributionChart from '@/components/dashboard/RiskDistributionChart';
import IncidentTable from '@/components/dashboard/IncidentTable';
import { RecentInvestigations, RecentIndicators } from '@/components/dashboard/RecentPanels';
import ReviewModal from '@/components/email-review/ReviewModal';
import { emailService } from '@/services/emailService';
import { dashboardViewForRole } from '@/utils/dashboardRole';
import type {
  DashboardStats, EmailRecord, Investigation, IOC,
  TrendDataPoint, RiskDistribution, ReviewStatus, User,
} from '@/types';
import {
  MOCK_DASHBOARD_STATS, MOCK_TREND_DATA, MOCK_TREND_7D, MOCK_TREND_30D,
  MOCK_RISK_DISTRIBUTION, MOCK_EMAILS, MOCK_INVESTIGATIONS, MOCK_IOCS,
} from '@/data/mockData';

export default function Dashboard({ user }: { user: User }) {
  const dashboardView = dashboardViewForRole(user.role);
  const [stats, setStats] = useState<DashboardStats>(MOCK_DASHBOARD_STATS);
  const [emails, setEmails] = useState<EmailRecord[]>(MOCK_EMAILS);
  const [investigations] = useState<Investigation[]>(MOCK_INVESTIGATIONS);
  const [iocs] = useState<IOC[]>(MOCK_IOCS);
  const [trend24h] = useState<TrendDataPoint[]>(MOCK_TREND_DATA);
  const [trend7d] = useState<TrendDataPoint[]>(MOCK_TREND_7D);
  const [trend30d] = useState<TrendDataPoint[]>(MOCK_TREND_30D);
  const [riskDist] = useState<RiskDistribution>(MOCK_RISK_DISTRIBUTION);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);

  useEffect(() => {
    emailService.getDashboardStats().then(s => { setStats(s); setLoading(false); });
  }, []);

  const handleReviewAction = async (emailId: string, status: ReviewStatus) => {
    await emailService.updateReviewStatus(emailId, status);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, reviewStatus: status } : e));
    setStats(prev => ({
      ...prev,
      pendingReviews: Math.max(0, prev.pendingReviews - 1),
    }));
  };

  if (dashboardView === 'employee') {
    const myEmails = emails.filter(email => email.recipient.toLowerCase() === user.email.toLowerCase());
    const pendingReviews = myEmails.filter(email => email.reviewStatus === 'pending');
    const decidedEmails = myEmails.filter(email => email.reviewStatus !== 'pending');

    return (
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-400">Employee workspace</p>
          <h1 className="mt-1 text-xl font-bold text-white">Your email reviews</h1>
          <p className="mt-1 text-sm text-slate-400">Review messages addressed to {user.email} and check your previous decisions.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Awaiting your review', value: pendingReviews.length },
            { label: 'Decisions recorded', value: decidedEmails.length },
            { label: 'Mailbox connection', value: 'Not connected' },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-teal-900/30 p-4" style={{ background: 'var(--card-bg)' }}>
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-black-100">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-200">Demo mailbox data only</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            No mailbox provider is connected. Messages shown here are sample data filtered by recipient; this view does not provide live delivery or secure access control.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-200">Messages requiring a decision</h2>
            <Link to="/review" className="flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200">
              All reviews <ArrowRight size={13} />
            </Link>
          </div>
          {pendingReviews.length ? (
            <IncidentTable emails={pendingReviews} loading={loading} onViewEmail={setSelectedEmail} />
          ) : (
            <div className="rounded-xl border border-teal-900/30 p-5 text-sm text-slate-400" style={{ background: 'var(--card-bg)' }}>
              No pending messages are available for this demo account.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Your decision history</h2>
          {decidedEmails.length ? (
            <IncidentTable emails={decidedEmails} loading={loading} onViewEmail={setSelectedEmail} />
          ) : (
            <div className="rounded-xl border border-teal-900/30 p-5 text-sm text-slate-400" style={{ background: 'var(--card-bg)' }}>
              No previous decisions are available for this demo account.
            </div>
          )}
        </section>

        {selectedEmail && (
          <ReviewModal
            email={selectedEmail}
            onClose={() => setSelectedEmail(null)}
            onAction={handleReviewAction}
          />
        )}
      </div>
    );
  }

  if (dashboardView === 'org_admin') {
    const adminLinks = [
      { label: 'Users and roles', description: 'Review organization membership and access roles.', href: '/user-roles', Icon: Users },
      { label: 'Security policies', description: 'Review email security and response policy settings.', href: '/policies', Icon: ShieldCheck },
      { label: 'Integrations', description: 'Configure authorized mail and security service connections.', href: '/integrations', Icon: Settings },
      { label: 'Audit logs', description: 'Inspect administrative and security activity records.', href: '/audit-logs', Icon: Activity },
    ];

    return (
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-400">Organization workspace</p>
          <h1 className="mt-1 text-xl font-bold text-white">Administration overview</h1>
          <p className="mt-1 text-sm text-slate-400">{user.organization} workspace configuration and service status.</p>
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-200">Demo workspace — no live organization services</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            User administration, policy enforcement, integrations, audit history, organization metrics, and system health require backend services and are not connected in this frontend.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          {adminLinks.map(({ label, description, href, Icon }) => (
            <Link key={href} to={href} className="group rounded-xl border border-teal-900/30 p-5 transition-colors hover:border-teal-500/40" style={{ background: 'var(--card-bg)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Icon size={19} className="mb-3 text-teal-400" />
                  <h2 className="text-sm font-semibold text-slate-200">{label}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                </div>
                <ArrowRight size={15} className="mt-1 text-slate-500 transition-colors group-hover:text-teal-300" />
              </div>
              <span className="mt-4 inline-flex rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">Not connected</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Welcome Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">SOC Operations Overview</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-lg">
            Monitor suspicious emails, investigate threats, and follow evidence across connected indicators.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/review"
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border border-teal-500/20 hover:border-teal-500/40 transition-colors"
            style={{ background: 'var(--card-bg)' }}
          >
            Review Queue
          </Link>
          <Link
            to="/analyze"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: '#14B8A6' }}
          >
            <Mail size={14} />
            Analyze Email
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards stats={stats} loading={loading} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ThreatTrendsChart data24h={trend24h} data7d={trend7d} data30d={trend30d} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <RiskDistributionChart data={riskDist} loading={loading} />
        </div>
      </div>

      {/* Incident Table */}
      <IncidentTable
        emails={emails}
        loading={loading}
        onViewEmail={setSelectedEmail}
      />

      {/* Recent Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentInvestigations investigations={investigations} loading={loading} />
        <RecentIndicators iocs={iocs} loading={loading} />
      </div>

      {selectedEmail && (
        <ReviewModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onAction={handleReviewAction}
        />
      )}
    </div>
  );
}
