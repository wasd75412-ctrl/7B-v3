import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeLineupByGender, malePairCount, normalizeGender } from '../src/lineup.js';

const arrange=(ids,genders)=>arrangeLineupByGender(ids,id=>genders[id]);

test('normalizes supported and unsupported gender values',()=>{
  assert.equal(normalizeGender('male'),'male');
  assert.equal(normalizeGender('female'),'female');
  assert.equal(normalizeGender('other'),'');
});

test('separates two male players onto different teams',()=>{
  const genders={m1:'male',m2:'male',f1:'female',f2:'female'};
  const result=arrange(['m1','m2','f1','f2'],genders);
  assert.equal(malePairCount(result,id=>genders[id]),0);
});

test('keeps an already valid mixed lineup unchanged',()=>{
  const genders={m1:'male',m2:'male',f1:'female',f2:'female'};
  assert.deepEqual(arrange(['m1','f1','m2','f2'],genders),['m1','f1','m2','f2']);
});

test('uses the minimum possible male pairs when three or four men play',()=>{
  const threeMen={m1:'male',m2:'male',m3:'male',f1:'female'};
  const fourMen={m1:'male',m2:'male',m3:'male',m4:'male'};
  const result3=arrange(['m1','m2','m3','f1'],threeMen);
  const result4=arrange(['m1','m2','m3','m4'],fourMen);
  assert.equal(malePairCount(result3,id=>threeMen[id]),1);
  assert.equal(malePairCount(result4,id=>fourMen[id]),2);
});

test('does not treat players with unset gender as male',()=>{
  const genders={m1:'male',m2:'male',u1:'',u2:undefined};
  const result=arrange(['m1','m2','u1','u2'],genders);
  assert.equal(malePairCount(result,id=>genders[id]),0);
});
