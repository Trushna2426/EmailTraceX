import { Mail, ShieldAlert, Search, Inbox, TrendingUp, TrendingDown } from 'lucide-react';
import type { DashboardStats } from '@/types';

interface SummaryCardsProps {
  stats: DashboardStats;
  loading: boolean;
}

export default function SummaryCards({ stats, loading }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Emails Analyzed',
      value: stats.emailsAnalyzed.toLocaleString(),
      delta: stats.emailsAnalyzedDelta,
      deltaLabel: 'vs last 24h',
      icon: Mail,
      accent: '#14B8A6',
      iconBg: 'rgba(20,184,166,0.12)',
    },
    {
      title: 'High-Risk Emails',
      value: stats.highRiskEmails.toLocaleString(),
      delta: stats.highRiskDelta,
      deltaLabel: 'vs yesterday',
      icon: ShieldAlert,
      accent: '#F05252',
      iconBg: 'rgba(240,82,82,0.12)',
    },
    {
      title: 'Open Investigations',
      value: stats.openInvestigations.toLocaleString(),
      delta: null,
      deltaLabel: 'active cases',
      icon: Search,
      accent: '#F5B942',
      iconBg: 'rgba(245,185,66,0.12)',
    },
    {
      title: 'Pending Reviews',
      value: stats.pendingReviews.toLocaleString(),
      delta: null,
      deltaLabel: 'need your decision',
      icon: Inbox,
      accent: '#2DE2D1',
      iconBg: 'rgba(45,226,209,0.12)',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className="rounded-xl p-5 border border-teal-900/30 transition-all hover:border-teal-500/30"
          style={{ background: 'var(--card-bg)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm font-medium text-slate-400">{card.title}</div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: card.iconBg }}>
              <card.icon size={16} style={{ color: card.accent }} />
            </div>
          </div>

          {loading ? (
            <div className="h-8 w-24 rounded-md animate-pulse" style={{ background: 'var(--surface-bg)' }} />
          ) : (
            <div className="text-3xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>
              {card.value}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs">
            {card.delta !== null ? (
              <>
                {card.delta > 0 ? (
                  <TrendingUp size={11} className="text-amber-400" />
                ) : (
                  <TrendingDown size={11} className="text-teal-400" />
                )}
                <span style={{ color: card.delta > 0 ? '#F5B942' : '#14B8A6' }}>
                  {card.delta > 0 ? '+' : ''}{card.delta}%
                </span>
              </>
            ) : null}
            <span className="text-slate-500">{card.deltaLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
