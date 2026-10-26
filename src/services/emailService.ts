import type { EmailRecord, Investigation, ReviewStatus } from '@/types';
import {
  MOCK_EMAILS, MOCK_INVESTIGATIONS, MOCK_DASHBOARD_STATS,
  MOCK_TREND_DATA, MOCK_TREND_7D, MOCK_TREND_30D, MOCK_RISK_DISTRIBUTION,
} from '@/data/mockData';

// Simulated async API layer — replace with real FastAPI calls when backend is ready
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const emailService = {
  async getDashboardStats() {
    await delay(300);
    return { ...MOCK_DASHBOARD_STATS };
  },

  async getTrendData(period: '24h' | '7d' | '30d') {
    await delay(200);
    if (period === '24h') return MOCK_TREND_DATA;
    if (period === '7d') return MOCK_TREND_7D;
    return MOCK_TREND_30D;
  },

  async getRiskDistribution() {
    await delay(200);
    return { ...MOCK_RISK_DISTRIBUTION };
  },

  async getEmails(): Promise<EmailRecord[]> {
    await delay(400);
    return [...MOCK_EMAILS];
  },

  async getEmailById(id: string): Promise<EmailRecord | undefined> {
    await delay(150);
    return MOCK_EMAILS.find(e => e.id === id);
  },

  async updateReviewStatus(emailId: string, status: ReviewStatus): Promise<void> {
    await delay(300);
    const email = MOCK_EMAILS.find(e => e.id === emailId);
    if (email) email.reviewStatus = status;
  },

  async getInvestigations(): Promise<Investigation[]> {
    await delay(350);
    return [...MOCK_INVESTIGATIONS];
  },

  async getInvestigationById(id: string): Promise<Investigation | undefined> {
    await delay(150);
    return MOCK_INVESTIGATIONS.find(i => i.id === id || i.caseId === id);
  },
};

// Future API integration points:
// export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
// Replace delay(...) stubs with: fetch(`${API_BASE}/emails`, { headers: { Authorization: `Bearer ${token}` } })
