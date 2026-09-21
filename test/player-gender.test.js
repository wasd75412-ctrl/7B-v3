import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayerGender, playerGenderLabel } from '../src/player-gender.js';

test('normalizes supported player genders',()=>{
  assert.equal(normalizePlayerGender('male'),'male');
  assert.equal(normalizePlayerGender('female'),'female');
  assert.equal(normalizePlayerGender('other'),'');
  assert.equal(normalizePlayerGender(undefined),'');
});

test('shows concise gender labels',()=>{
  assert.equal(playerGenderLabel('male'),'男性');
  assert.equal(playerGenderLabel('female'),'女性');
  assert.equal(playerGenderLabel(''),'未設定');
});
