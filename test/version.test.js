import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('keeps the BCM version within the 50-patch and 10-minor rollover rules', () => {
  const parts = packageJson.version.split('.').map(Number);
  assert.equal(parts.length, 3);
  assert.ok(parts.every(Number.isInteger));
  assert.ok(parts[1] >= 0 && parts[1] < 10, 'minor version must roll over before 10');
  assert.ok(parts[2] >= 0 && parts[2] < 50, 'patch version must roll over before 50');
});

test('keeps package-lock BCM versions synchronized', () => {
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
});
