export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ReviewStatus = 'pending' | 'kept' | 'spam' | 'phishing' | 'analyst_review' | 'investigating';
export type InvestigationStatus = 'open' | 'in_progress' | 'closed' | 'escalated';
export type IOCType = 'domain' | 'ip' | 'url' | 'hash' | 'email';

export interface EmailRecord {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  recipient: string;
  receivedAt: string;
  analyzedAt: string;
  riskLevel: RiskLevel;
  riskScore: number;
  reviewStatus: ReviewStatus;
  indicators: string[];
  spfResult: 'pass' | 'fail' | 'neutral' | 'none';
  dkimResult: 'pass' | 'fail' | 'none';
  dmarcResult: 'pass' | 'fail' | 'none';
  urls: UrlFinding[];
  attachments: AttachmentFinding[];
  bodySnippet: string;
  riskExplanation: string;
  headers: Record<string, string>;
  caseId?: string;
}

export interface UrlFinding {
  url: string;
  verdict: 'malicious' | 'suspicious' | 'safe' | 'unknown';
  redirects: number;
  domain: string;
}

export interface AttachmentFinding {
  filename: string;
  mimetype: string;
  hash: string;
  verdict: 'malicious' | 'suspicious' | 'safe' | 'unknown';
  size: number;
}

export interface Investigation {
  id: string;
  caseId: string;
  title: string;
  status: InvestigationStatus;
  assignedAnalyst: string;
  createdAt: string;
  updatedAt: string;
  emailId: string;
  summary: string;
  notes: string;
  tags: string[];
  iocs: IOC[];
  timeline: TimelineEvent[];
}

export interface IOC {
  id: string;
  type: IOCType;
  value: string;
  caseId: string;
  firstSeen: string;
  verdict: 'malicious' | 'suspicious' | 'benign' | 'unknown';
  source: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface DashboardStats {
  emailsAnalyzed: number;
  emailsAnalyzedDelta: number;
  highRiskEmails: number;
  highRiskDelta: number;
  openInvestigations: number;
  pendingReviews: number;
}

export interface TrendDataPoint {
  time: string;
  suspicious: number;
  highRisk: number;
  confirmed: number;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface Notification {
  id: string;
  type: 'alert' | 'info' | 'success';
  message: string;
  timestamp: string;
  read: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'soc_analyst' | 'org_admin';
  organization: string;
  avatarInitials: string;
  organizationId?: string;
  accountStatus?: 'active' | 'invited' | 'disabled';
}
