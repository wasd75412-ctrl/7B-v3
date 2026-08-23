import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateShuttleTube,
  createShuttleTube,
  enforceLegacyActiveShuttleTube,
  normalizeShuttleTubes,
  restoreShuttleTube,
  setShuttlePaymentStatus,
  setShuttlePayment,
  setShuttleRemaining,
  softDeleteShuttleTube,
  shuttlePaymentStatus,
  updateShuttleTube
} from '../src/shuttle-tube.js';

test('tracks paid players separately from unpaid players',()=>{
  const tube=createShuttleTube({id:'tube-1',name:'AS-30',price:950,createdAt:'2026-07-24T01:00:00.000Z'});
  const paid=setShuttlePayment(tube,'p1',true,{paidAt:'2026-07-24T02:00:00.000Z',historyCount:1});
  assert.equal(shuttlePaymentStatus(paid,[],'p1'),'paid-waiting');
  assert.equal(shuttlePaymentStatus(paid,[],'p2'),'unpaid');
});

test('changes a paid player to played after a later match',()=>{
  const tube=setShuttlePayment(
    createShuttleTube({id:'tube-1',name:'AS-30',price:950,createdAt:'2026-07-24T01:00:00.000Z',status:'active'}),
    'p1',
    true,
    {paidAt:'2026-07-24T02:00:00.000Z',historyCount:1}
  );
  const history=[
    {endedAt:'2026-07-24T01:30:00.000Z',teams:[['p1','p2'],['p3','p4']]},
    {endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1','p3'],['p2','p4']]}
  ];
  assert.equal(shuttlePaymentStatus(tube,history,'p1'),'paid-played');
});

test('syncs a paid player who already played after the tube was activated',()=>{
  const tube=setShuttlePayment(
    normalizeShuttleTubes([{
      id:'tube-1',name:'AS-30',status:'active',createdAt:'2026-07-24T00:30:00.000Z',
      activatedAt:'2026-07-24T01:00:00.000Z',activationHistoryCount:0
    }])[0],
    'p1',
    true,
    {paidAt:'2026-07-24T04:00:00.000Z',historyCount:1}
  );
  const history=[{endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1','p2'],['p3','p4']]}];
  assert.equal(shuttlePaymentStatus(tube,history,'p1'),'paid-played');
});

test('keeps a paid player waiting while a new tube is not active',()=>{
  const tube=setShuttlePayment(
    createShuttleTube({id:'pending',name:'AS-30',createdAt:'2026-07-24T01:00:00.000Z'}),
    'p1',
    true,
    {paidAt:'2026-07-24T02:00:00.000Z',historyCount:0}
  );
  const history=[{endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1','p2'],['p3','p4']]}];
  assert.equal(tube.status,'pending');
  assert.equal(shuttlePaymentStatus(tube,history,'p1'),'paid-waiting');
});

test('activating a new tube finishes the old tube and starts tracking from that match count',()=>{
  const oldTube=createShuttleTube({id:'old',name:'舊桶',createdAt:'2026-07-23T01:00:00.000Z',status:'active'});
  const pending=setShuttlePayment(
    createShuttleTube({id:'new',name:'新桶',createdAt:'2026-07-24T01:00:00.000Z'}),
    'p1',
    true,
    {paidAt:'2026-07-24T02:00:00.000Z',historyCount:0}
  );
  const activated=activateShuttleTube([pending,oldTube],'new',{activatedAt:'2026-07-24T04:00:00.000Z',historyCount:1});
  const current=activated.find(tube=>tube.id==='new'),finished=activated.find(tube=>tube.id==='old');
  assert.equal(current.status,'active');
  assert.equal(current.activationHistoryCount,1);
  assert.equal(finished.status,'finished');
  assert.equal(shuttlePaymentStatus(current,[{endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1'],[]]}],'p1'),'paid-waiting');
  assert.equal(shuttlePaymentStatus(current,[
    {endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1'],[]]},
    {endedAt:'2026-07-24T05:00:00.000Z',teams:[['p1'],[]]}
  ],'p1'),'paid-played');
});

test('migrates the newest legacy tube as active and clamps remaining shuttles',()=>{
  const migrated=normalizeShuttleTubes([
    {id:'old',name:'舊桶',createdAt:'2026-07-23T01:00:00.000Z'},
    {id:'new',name:'目前桶',createdAt:'2026-07-24T01:00:00.000Z'}
  ]);
  assert.equal(migrated[0].status,'active');
  assert.equal(migrated[1].status,'finished');
  assert.equal(setShuttleRemaining(migrated[0],99).remainingShuttles,12);
  assert.equal(setShuttleRemaining(migrated[0],-1).remainingShuttles,0);
});

test('lets an admin explicitly edit paid and played status',()=>{
  const tube=createShuttleTube({id:'tube',name:'AS-30',status:'active'});
  const paid=setShuttlePaymentStatus(tube,'p1','paid-waiting',{paidAt:'2026-07-28T01:00:00.000Z',historyCount:0});
  assert.equal(shuttlePaymentStatus(paid,[{endedAt:'2026-07-28T02:00:00.000Z',teams:[['p1'],[]]}],'p1'),'paid-played');
  const played=setShuttlePaymentStatus(paid,'p1','paid-played');
  assert.equal(shuttlePaymentStatus(played,[],'p1'),'paid-played');
  assert.equal(shuttlePaymentStatus(setShuttlePaymentStatus(played,'p1','unpaid'),[],'p1'),'unpaid');
});

test('removes legacy waiting overrides so participation can sync again',()=>{
  const tube=normalizeShuttleTubes([{
    id:'tube',name:'AS-30',status:'active',activatedAt:'2026-07-28T01:00:00.000Z',
    paid:{p1:{paidAt:'2026-07-28T03:00:00.000Z',historyCount:1,playedOverride:false}}
  }])[0];
  assert.equal('playedOverride' in tube.paid.p1,false);
  assert.equal(shuttlePaymentStatus(tube,[{endedAt:'2026-07-28T02:00:00.000Z',teams:[['p1'],[]]}],'p1'),'paid-played');
});

test('edits tube details while keeping remaining count valid',()=>{
  const tube=createShuttleTube({id:'tube',name:'AS-30',price:950,totalShuttles:12,status:'active'});
  const edited=updateShuttleTube(tube,{name:'Volar-10',price:880,totalShuttles:6,remainingShuttles:9});
  assert.equal(edited.name,'Volar-10');
  assert.equal(edited.price,880);
  assert.equal(edited.totalShuttles,6);
  assert.equal(edited.remainingShuttles,6);
});

test('soft deletes and restores an old tube without affecting the active tube',()=>{
  const active=createShuttleTube({id:'active',name:'目前桶',status:'active'});
  const old=createShuttleTube({id:'old',name:'舊桶',status:'finished'});
  const deleted=softDeleteShuttleTube([active,old],'old','2026-07-28T01:00:00.000Z');
  assert.equal(deleted.find(tube=>tube.id==='old').status,'deleted');
  const restored=restoreShuttleTube(deleted,'old');
  assert.equal(restored.find(tube=>tube.id==='active').status,'active');
  assert.equal(restored.find(tube=>tube.id==='old').status,'finished');
});

test('keeps a legacy tube active until the admin intentionally starts the new tube',()=>{
  const legacy=createShuttleTube({id:'legacy',name:'舊桶',status:'finished'});
  const newTube=createShuttleTube({id:'new',name:'新桶',status:'active'});
  const locked=enforceLegacyActiveShuttleTube([newTube,legacy],'legacy');
  assert.equal(locked.find(tube=>tube.id==='legacy').status,'active');
  assert.equal(locked.find(tube=>tube.id==='new').status,'pending');
});
