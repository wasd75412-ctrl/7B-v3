import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayDayCount, isBirthdayDay, isBirthdayMonth, normalizePlayerBirthday, playerBirthdayLabel } from '../src/player-birthday.js';

test('keeps a valid month and day without a year', () => {
  assert.deepEqual(normalizePlayerBirthday(11, 13), {birthMonth:11, birthDay:13});
  assert.deepEqual(normalizePlayerBirthday('2', '29'), {birthMonth:2, birthDay:29});
  assert.equal(playerBirthdayLabel({birthMonth:11, birthDay:13}), '11月13日');
});

test('clears an incomplete or impossible birthday', () => {
  assert.deepEqual(normalizePlayerBirthday('', ''), {birthMonth:0, birthDay:0});
  assert.deepEqual(normalizePlayerBirthday(2, 30), {birthMonth:0, birthDay:0});
  assert.deepEqual(normalizePlayerBirthday(4, 31), {birthMonth:0, birthDay:0});
  assert.deepEqual(normalizePlayerBirthday(13, 1), {birthMonth:0, birthDay:0});
  assert.equal(playerBirthdayLabel({}), '未設定');
  assert.equal(birthdayDayCount(2), 29);
  assert.equal(birthdayDayCount(4), 30);
});

test('marks only players whose birthday month is the current month', () => {
  const november = new Date(2026, 10, 13);
  assert.equal(isBirthdayMonth({birthMonth:11, birthDay:3}, november), true);
  assert.equal(isBirthdayMonth({birthMonth:12, birthDay:3}, november), false);
  assert.equal(isBirthdayMonth({birthMonth:0, birthDay:0}, november), false);
});

test('celebrates on the exact birthday day', () => {
  const today = new Date(2026, 10, 13);
  assert.equal(isBirthdayDay({birthMonth:11, birthDay:13}, today), true);
  assert.equal(isBirthdayDay({birthMonth:11, birthDay:12}, today), false);
  assert.equal(isBirthdayDay({birthMonth:10, birthDay:13}, today), false);
});

test('moves Feb 29 birthdays to Feb 28 outside leap years', () => {
  assert.equal(isBirthdayDay({birthMonth:2, birthDay:29}, new Date(2026, 1, 28)), true);
  assert.equal(isBirthdayDay({birthMonth:2, birthDay:29}, new Date(2026, 1, 29)), false);
  assert.equal(isBirthdayDay({birthMonth:2, birthDay:29}, new Date(2024, 1, 29)), true);
  assert.equal(isBirthdayDay({birthMonth:2, birthDay:29}, new Date(2024, 1, 28)), false);
});
