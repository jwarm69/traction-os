import assert from 'node:assert/strict';
const base = process.env.VERIFY_BASE_URL;
if (!base) throw Error('VERIFY_BASE_URL required');
const username = 'context_check_' + Date.now();
let cookie;
async function request(path, body) {
  const response = await fetch(base + path, {method:body ? 'POST' : 'GET', headers:{'Content-Type':'application/json', Origin:base,...(cookie ? {Cookie:cookie} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || String(response.status));
  if (response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
  return data;
}
await request('/api/auth/register', {username, pin:'482653'});
let result = await request('/api/workspace',{op:'create_business',name:'Context verification',url:'https://example.com',research:false});
const id=result.business.id;
async function act(op, extra={}) {
  result = await request('/api/workspace',{op,businessId:id,revision:result.revision,...extra});
}
try {
  await act('save_context',{update:'We sell golf lessons to beginners. We have two hours a week for marketing.'});
  await act('save_context',{update:'Our priority is five trial bookings this month.'});
  assert.match(result.business.notes,/golf lessons/);
  assert.match(result.business.notes,/five trial bookings/);
  const reloaded=await request('/api/workspace?businessId='+id);
  assert.equal(reloaded.business.notes,result.business.notes);
  await act('organize_context');
  assert.ok(result.business.contextDraft.summary.length>20);
  assert.ok(result.business.contextDraft.questions.length<=3);
  await act('save_context',{update:'We teach at a local driving range.'});
  assert.equal(result.business.contextDraft,undefined);
  console.log(JSON.stringify({savedUpdates:true,reloadPersistence:true,liveAISummary:true,staleSummaryCleared:true,temporaryAccount:username}));
} finally {
  // Printed identifier lets the operator delete only this verification account.
  console.log('Cleanup account: '+username);
}
