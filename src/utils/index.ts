import type { RiskLevel, ReviewStatus, InvestigationStatus } from '@/types';

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'risk-critical';
    case 'high': return 'risk-high';
    case 'medium': return 'risk-medium';
    case 'low': return 'risk-low';
  }
}

export function riskBg(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'bg-red-500/15 text-red-400 border border-red-500/30';
    case 'high': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'medium': return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
    case 'low': return 'bg-teal-500/15 text-teal-400 border border-teal-500/30';
  }
}

export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'kept': return 'Kept';
    case 'spam': return 'Moved to Spam';
    case 'phishing': return 'Reported Phishing';
    case 'analyst_review': return 'Analyst Review';
    case 'investigating': return 'Investigating';
  }
}

export function reviewStatusBg(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'kept': return 'bg-teal-500/15 text-teal-400 border border-teal-500/30';
    case 'spam': return 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
    case 'phishing': return 'bg-red-500/15 text-red-400 border border-red-500/30';
    case 'analyst_review': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'investigating': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
  }
}

export function investigationStatusBg(status: InvestigationStatus): string {
  switch (status) {
    case 'open': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'in_progress': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'closed': return 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
    case 'escalated': return 'bg-red-500/15 text-red-400 border border-red-500/30';
  }
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function riskScoreColor(score: number): string {
  if (score >= 80) return 'risk-critical';
  if (score >= 60) return 'risk-high';
  if (score >= 40) return 'risk-medium';
  return 'risk-low';
}
