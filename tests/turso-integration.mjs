import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';
import { listBusinesses, loadBusiness, saveBusiness } from '../lib/turso.ts';

const credential=spawnSync('turso',['db','tokens','create','traction-memory','--expiration','1d'],{encoding:'utf8'});
if(credential.status!==0) throw Error('Turso test credential unavailable.');
const runtime={TURSO_DATABASE_URL:'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',TURSO_AUTH_TOKEN:credential.stdout.trim()};
const db=createClient({url:runtime.TURSO_DATABASE_URL,authToken:runtime.TURSO_AUTH_TOKEN});
const user={id:`traction-test-${crypto.randomUUID()}`,email:null,name:'Integration test'};
const other={id:`traction-test-${crypto.randomUUID()}`,email:null,name:'Other test user'};
const id=crypto.randomUUID();
const json=(name)=>JSON.stringify({id,name,url:'https://example.com',mode:'demo'});
try {
  assert.equal(await saveBusiness(runtime,user,id,json('Initial'),null),1);
  assert.equal(await loadBusiness(runtime,other.id,id),null);
  assert.equal((await listBusinesses(runtime,user.id)).length,1);
  const parallel=await Promise.all([
    saveBusiness(runtime,user,id,json('First competing write'),1),
    saveBusiness(runtime,user,id,json('Second competing write'),1),
  ]);
  assert.equal(parallel.filter(x=>x===2).length,1);
  assert.equal(parallel.filter(x=>x===null).length,1);
  const persisted=await loadBusiness(runtime,user.id,id);
  assert.equal(persisted.revision,2);
  const before=persisted.data;
  assert.equal(await saveBusiness(runtime,other,id,json('Other owner same id'),null),1);
  assert.equal((await loadBusiness(runtime,user.id,id)).data,before);
  console.log('PASS live Turso: durable save/reload, separate users, same-ID isolation, concurrent revision protection.');
} finally {
  for(const owner of [user.id,other.id]) {
    await db.batch([
      {sql:'DELETE FROM business_documents WHERE user_id=?',args:[owner]},
      {sql:'DELETE FROM users WHERE id=?',args:[owner]},
    ],'write');
  }
  db.close();
}
