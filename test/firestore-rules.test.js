import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');

test('live score rejects an older page that demotes a versioned scorer guard',()=>{
  assert.match(rules,/function hasScorerGuard\(\)/);
  assert.match(rules,/function preservesScorerGuard\(\)/);
  assert.match(rules,/match\.scorerDevice == resource\.data\.scorerGuard\.device/);
  assert.match(rules,/allow update: if preservesScorerGuard\(\);/);
});

test('diagnostics reject an older page once a guarded build has written',()=>{
  assert.match(rules,/function diagnosticsWriteOk\(\)/);
  assert.match(rules,/controlId != 'diagnostics' \|\| diagnosticsWriteOk\(\)/);
  assert.match(rules,/request\.resource\.data\.keys\(\)\.hasAll\(\['versionKey'\]\)/);
});
