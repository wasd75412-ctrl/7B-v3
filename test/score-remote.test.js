import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCORE_REMOTE_BINDINGS,
  assignRemoteBinding,
  isEditableRemoteTarget,
  normalizeRemoteBindings,
  remoteActionForCode,
  remoteEventCode,
  shouldHandleRemoteInput
} from '../src/score-remote.js';

test('uses safe default keyboard controls when no remote was learned',()=>{
  assert.deepEqual(normalizeRemoteBindings(),DEFAULT_SCORE_REMOTE_BINDINGS);
  assert.equal(remoteActionForCode(DEFAULT_SCORE_REMOTE_BINDINGS,'ArrowLeft'),'teamAPlus');
  assert.equal(remoteActionForCode(DEFAULT_SCORE_REMOTE_BINDINGS,'PageDown'),'teamBMinus');
});

test('learning a duplicate key moves it to the latest action',()=>{
  const bindings=assignRemoteBinding(DEFAULT_SCORE_REMOTE_BINDINGS,'undo','ArrowLeft');
  assert.equal(bindings.undo,'ArrowLeft');
  assert.equal(bindings.teamAPlus,'');
  assert.equal(remoteActionForCode(bindings,'ArrowLeft'),'undo');
});

test('reads physical keyboard code and falls back to key',()=>{
  assert.equal(remoteEventCode({code:'KeyA',key:'a'}),'KeyA');
  assert.equal(remoteEventCode({code:'Unidentified',key:'Enter'}),'Enter');
  assert.equal(remoteEventCode({key:' '}),'Space');
});

test('remote input only changes a live admin scoreboard',()=>{
  const ready={enabled:true,isHost:true,scoreVisible:true,matchActive:true,matchFinished:false,repeat:false,editable:false};
  assert.equal(shouldHandleRemoteInput(ready),true);
  for(const property of ['enabled','isHost','scoreVisible','matchActive'])assert.equal(shouldHandleRemoteInput({...ready,[property]:false}),false);
  assert.equal(shouldHandleRemoteInput({...ready,matchFinished:true}),false);
  assert.equal(shouldHandleRemoteInput({...ready,repeat:true}),false);
  assert.equal(shouldHandleRemoteInput({...ready,editable:true}),false);
});

test('does not capture typing fields',()=>{
  assert.equal(isEditableRemoteTarget({tagName:'INPUT'}),true);
  assert.equal(isEditableRemoteTarget({tagName:'div',isContentEditable:true}),true);
  assert.equal(isEditableRemoteTarget({tagName:'BUTTON'}),false);
});
