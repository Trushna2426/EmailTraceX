import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardViewForRole } from './dashboardRole.ts';

test('selects the matching dashboard view for each role', () => {
  assert.equal(dashboardViewForRole('employee'), 'employee');
  assert.equal(dashboardViewForRole('soc_analyst'), 'soc_analyst');
  assert.equal(dashboardViewForRole('org_admin'), 'org_admin');
});
