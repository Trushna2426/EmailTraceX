import type { User } from '../types';

export type DashboardView = 'employee' | 'soc_analyst' | 'org_admin';

const DASHBOARD_BY_ROLE: Record<User['role'], DashboardView> = {
  employee: 'employee',
  soc_analyst: 'soc_analyst',
  org_admin: 'org_admin',
};

export function dashboardViewForRole(role: User['role']): DashboardView {
  return DASHBOARD_BY_ROLE[role];
}
