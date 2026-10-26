import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRegistrationPassword } from './passwordPolicy.ts';

test('applies the shared minimum and safe UTF-8 byte limit', () => {
  assert.match(validateRegistrationPassword('1234567') ?? '', /at least 8/);
  assert.equal(validateRegistrationPassword('12345678'), null);
  assert.equal(validateRegistrationPassword('123456789012'), null);
  assert.equal(validateRegistrationPassword('a'.repeat(300)), null);
  assert.match(validateRegistrationPassword('é'.repeat(513)) ?? '', /1024 UTF-8 bytes/);
});
