import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoleButtonState, resolveAdminSessionToken } from '../src/admin-role.js';

test('keeps a logged-out device in viewer mode even when an admin token is saved',()=>{
  assert.equal(resolveAdminSessionToken({
    loggedOut:true,
    savedToken:'host-token',
    roomToken:'host-token'
  }),'');
});

test('restores admin mode only with the correct saved or linked token',()=>{
  assert.equal(resolveAdminSessionToken({savedToken:'host-token',roomToken:'host-token'}),'host-token');
  assert.equal(resolveAdminSessionToken({urlToken:'linked-token',savedToken:'old-token',roomToken:'linked-token'}),'linked-token');
  assert.equal(resolveAdminSessionToken({savedToken:'wrong-token',roomToken:'host-token'}),'');
});

test('shows an explicit logout control to administrators',()=>{
  assert.deepEqual(adminRoleButtonState(true),{label:'登出管理員',className:'btn danger-outline'});
  assert.deepEqual(adminRoleButtonState(false),{label:'管理員登入',className:'btn'});
});
