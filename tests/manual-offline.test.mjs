import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const requireServer=createRequire(new URL('artifacts/api-server/package.json',root));
const requireZod=createRequire(new URL('lib/api-zod/package.json',root));
function load(source,overrides={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:id=>id in overrides?overrides[id]:requireServer(id),Buffer,console,AbortController,setTimeout,clearTimeout,process});
  return exports;
}
const core=load(read('lib/api-client-react/src/offline-ledger.ts'));
const manual=load(read('lib/api-client-react/src/manual-entry.ts'));
const schema=load(read('lib/api-zod/src/generated/api.ts'),{zod:requireZod('zod')});
const base={type:'expense',date:'2026-11-01',amount:12.5,currency:'AED',accountId:11,status:'settled'};
const id='2c622802-9cf1-4d53-8c32-6bba2d02d6e9';
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function memoryStorage() {
  const records=new Map();let owner=null,tail=Promise.resolve(),fail=false;
  return {records,fail:(value)=>{fail=value;},read:async(owner)=>clone(records.get(owner)??core.emptyLedger()),update(owner,change){const task=tail.catch(()=>{}).then(()=>{if(fail)throw Error('quota');const next=change(clone(records.get(owner)??core.emptyLedger()));records.set(owner,clone(next));return clone(next);});tail=task;return task;},async activeOwner(value){if(value!==undefined)owner=value;return owner;}};
}
for(const [field,value] of [['date','2026-02-31'],['amount',0],['amount',-2],['amount',12.555],['amount',12.55001],['amount',0.00001],['amount',Infinity],['type','unknown'],['status','unknown'],['accountId',0]]) {
  test(`manual validation rejects ${field}=${value}`,()=>assert.ok(manual.transactionError({...base,[field]:value})));
}
test('manual validation accepts leap dates, Arabic-normalized decimals and distinct transfers',()=>{
  assert.equal(manual.transactionError({...base,date:'2024-02-29'}),null);
  assert.equal(manual.transactionError({...base,type:'transfer',toAccountId:22}),null);
  assert.ok(manual.transactionError({...base,type:'transfer',toAccountId:11}));
});
test('outbox and drafts survive restart without a network call',async()=>{
  const storage=memoryStorage();let calls=0;
  const first=new core.OfflineLedger(storage,()=>id,async()=>{calls++;},()=>false);
  await first.activate('a');
  await first.saveDraft('a',id,{amount:'12.50'});
  await first.enqueue('a',base,id);
  const second=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);
  const restored=await second.read('a');
  assert.equal(restored.draft,null);assert.equal(restored.outbox.length,1);assert.equal(restored.outbox[0].payload.clientRequestId,id);assert.equal(calls,0);
});
test('concurrent enqueues preserve both transactions and repeated ids stay single',async()=>{
  const ledger=new core.OfflineLedger(memoryStorage(),()=>id,async()=>{},()=>false);
  await Promise.all([ledger.enqueue('a',base,id),ledger.enqueue('a',{...base,amount:20},'3c622802-9cf1-4d53-8c32-6bba2d02d6e9')]);
  await ledger.enqueue('a',base,id);
  assert.equal((await ledger.read('a')).outbox.length,2);
  await assert.rejects(ledger.enqueue('a',{...base,amount:99},id));
});
test('storage failure never reports a successful local save',async()=>{
  const storage=memoryStorage();storage.fail(true);
  const ledger=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);
  await assert.rejects(ledger.enqueue('a',base,id));assert.equal(storage.records.size,0);
});
test('lost response keeps request id and next sync removes only the acknowledged item',async()=>{
  const storage=memoryStorage();let attempts=0;const ids=[];
  const ledger=new core.OfflineLedger(storage,()=>id,async(owner,payload)=>{ids.push(payload.clientRequestId);if(++attempts===1)throw new TypeError('lost response');return {...payload,id:7,createdAt:'2026-11-01'};});
  await ledger.enqueue('a',base,id);await ledger.activate('a');await tick();await tick();
  assert.equal((await ledger.read('a')).outbox.length,1);
  await ledger.flush();assert.equal((await ledger.read('a')).outbox.length,0);assert.deepEqual(ids,[id,id]);
});
test('validation errors remain visible and can be recovered into an editable draft',async()=>{
  const storage=memoryStorage();const ledger=new core.OfflineLedger(storage,()=>id,async()=>{throw {status:400,data:{error:'Invalid accountId'}};});
  await ledger.enqueue('a',base,id);await ledger.activate('a');await tick();await tick();
  assert.equal((await ledger.read('a')).outbox[0].state,'blocked');
  const draft=await ledger.recover('a',id);assert.equal(draft.values.amount,'12.5');assert.equal((await ledger.read('a')).outbox.length,0);assert.equal((await ledger.read('a')).draft.id,id);
});
test('conflicts are not silently discarded as if they were rejected writes',async()=>{
  const ledger=new core.OfflineLedger(memoryStorage(),()=>id,async()=>{throw {status:409};});
  await ledger.enqueue('a',base,id);await ledger.activate('a');await tick();await tick();
  await assert.rejects(ledger.recover('a',id));assert.equal((await ledger.read('a')).outbox.length,1);
});
test('switching users aborts an in-flight send and does not leak cached results',async()=>{
  let release,started;const wait=new Promise(resolve=>{started=resolve;});
  const ledger=new core.OfflineLedger(memoryStorage(),()=>id,async(owner,payload)=>{started();return await new Promise(resolve=>{release=()=>resolve({...payload,id:7});});});
  await ledger.enqueue('a',base,id);await ledger.activate('a');await wait;
  await ledger.activate('b');release();await tick();await tick();
  assert.equal((await ledger.read('b')).outbox.length,0);assert.equal((await ledger.read('b')).references.transactions,undefined);assert.equal((await ledger.read('a')).outbox.length,1);
});
test('account erasure clears only that user and unsets the offline identity',async()=>{
  const storage=memoryStorage();const ledger=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);
  await ledger.enqueue('a',base,id);await ledger.enqueue('b',base,id);await ledger.activate('a');await ledger.erase('a');
  assert.equal((await ledger.read('a')).outbox.length,0);assert.equal((await ledger.read('b')).outbox.length,1);assert.equal(await storage.activeOwner(),null);
});

function transactionServer() {
  const tables={transactionsTable:{},clientsTable:{},tripsTable:{},accountsTable:{},transactionReceiptsTable:{}};
  for(const table of Object.values(tables))for(const key of ['id','userId','requestId','date'])table[key]={key};
  const records=new Map(Object.values(tables).map(table=>[table,[]]));
  records.set(tables.accountsTable,[{id:11,userId:'a',name:'Cash'}]);
  let tail=Promise.resolve(),nextId=1,failReceipt=false;
  const matches=(row,condition)=>!condition||condition.kind==='and'?(!condition||condition.parts.every(part=>matches(row,part))):row[condition.field.key]===condition.value;
  const connection={
    update(table){return {set(values){return {where(condition){return {returning:async()=>records.get(table).filter(row=>matches(row,condition)).map(row=>Object.assign(row,values))};}};}};},
    async execute(){},
    select(){return {from(table){let condition;const query={where(c){condition=c;return query;},orderBy(){return query;},then(resolve,reject){return Promise.resolve(records.get(table).filter(row=>matches(row,condition))).then(resolve,reject);}};return query;}};},
    insert(table){return {values(value){let done=false,result;const insert=()=>{if(!done){if(table===tables.transactionReceiptsTable&&failReceipt)throw Error('receipt failed');result=table===tables.transactionsTable?{...value,id:nextId++,createdAt:new Date(),updatedAt:new Date()}:value;records.get(table).push(result);done=true;}return result;};return {returning:async()=>[insert()],then(resolve,reject){try{return Promise.resolve(insert()).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);}}};}};},
  };
  const db={...connection,transaction(fn){const task=tail.catch(()=>{}).then(async()=>{const before=new Map([...records].map(([table,rows])=>[table,[...rows]]));try{return await fn(connection);}catch(error){for(const [table,rows]of before)records.set(table,rows);throw error;}});tail=task;return task;}};
  const voice=load(read('artifacts/api-server/src/lib/voice-input.ts'));
  const debtMath=load(read('artifacts/api-server/src/lib/debt-math.ts'));
  const debtHelpers=load(read('artifacts/api-server/src/lib/debts.ts'),{'./debt-math.js':debtMath,'@workspace/db':{...tables,db},'drizzle-orm':{eq:(field,value)=>({field,value})}});
  const router=load(read('artifacts/api-server/src/routes/transactions.ts'),{
    '../lib/debt-math.js':debtMath,'../lib/debts.js':debtHelpers,'@workspace/db':{...tables,db},'@workspace/api-zod':schema,'../lib/voice-input.js':voice,
    'drizzle-orm':{eq:(field,value)=>({field,value}),and:(...parts)=>({kind:'and',parts}),desc:()=>{},sql:()=>{}},
    '../middlewares/requireAuth.js':{requireAuth:(_req,_res,next)=>next()},
  }).default;
  const route=router.stack.find(layer=>layer.route?.path==='/transactions'&&layer.route.methods.post).route.stack.at(-1).handle;
  const patch=router.stack.find(layer=>layer.route?.path==='/transactions/:id'&&layer.route.methods.patch).route.stack.at(-1).handle;
  return {async patch(id,body){let status=200,result;await patch({params:{id:String(id)},body,userId:'a',log:{error(){}}},{status(v){status=v;return this;},json(v){result=v;return this;}});return {status,body:result};},records,tables,failReceipt(value){failReceipt=value;},async call(body,owner='a',expectedOwner=owner){let result,status=200;await route({body,userId:owner,header:()=>expectedOwner,log:{error(){}}},{status(value){status=value;return this;},json(value){result=value;return this;}});return {status,body:result};}};
}
test('server rejects invalid dates, precision and account-owner mismatches before inserting',async()=>{
  const server=transactionServer();
  assert.equal((await server.call({...base,date:'2026-02-31'})).status,400);
  assert.equal((await server.call({...base,amount:1.555})).status,400);
  assert.equal((await server.call({...base,amount:12.55001})).status,400);
  assert.equal((await server.call({...base,amount:0.00001})).status,400);
  assert.equal((await server.call(base,'a','b')).status,403);
  assert.equal(server.records.get(server.tables.transactionsTable).length,0);
});
test('concurrent retries with the same id create one transaction and replay the original result',async()=>{
  const server=transactionServer();const input={...base,clientRequestId:id};
  const [first,second]=await Promise.all([server.call(input),server.call(input)]);
  assert.deepEqual([first.status,second.status],[201,200]);assert.equal(first.body.id,second.body.id);assert.equal(server.records.get(server.tables.transactionsTable).length,1);
  assert.equal((await server.call({...input,amount:99})).status,409);assert.equal(server.records.get(server.tables.transactionsTable).length,1);
});
test('receipt failure rolls back transaction creation so a retry is safe',async()=>{
  const server=transactionServer();server.failReceipt(true);
  assert.equal((await server.call({...base,clientRequestId:id})).status,500);assert.equal(server.records.get(server.tables.transactionsTable).length,0);
  server.failReceipt(false);assert.equal((await server.call({...base,clientRequestId:id})).status,201);assert.equal(server.records.get(server.tables.transactionsTable).length,1);
});
test('same request id belongs to its authenticated user, not another user',async()=>{
  const server=transactionServer();await server.call({...base,clientRequestId:id});
  assert.equal((await server.call({...base,clientRequestId:id},'b')).status,400);
  server.records.get(server.tables.accountsTable).push({id:22,userId:'b',name:'Other Cash'});
  assert.equal((await server.call({...base,accountId:22,clientRequestId:id},'b')).status,201);
});
test('offline replay after a lost HTTP acknowledgement does not duplicate server transactions',async()=>{
  const server=transactionServer();let calls=0;
  const ledger=new core.OfflineLedger(memoryStorage(),()=>id,async(owner,payload)=>{const response=await server.call(payload,owner);assert.ok(response.status<300);if(++calls===1)throw TypeError('lost response');return response.body;});
  await ledger.enqueue('a',base,id);await ledger.activate('a');await tick();await tick();await ledger.flush();
  assert.equal(server.records.get(server.tables.transactionsTable).length,1);assert.equal((await ledger.read('a')).outbox.length,0);
});

test('service worker caches hashed assets and never substitutes HTML for JS or caches APIs',async()=>{
  const events={},cache=new Map();let online=true;
  const sw=read('artifacts/finance-app/public/sw.js');
  const put=(request,response)=>cache.set(typeof request==='string'?request:request.url,response);
  const cacheStore={put:async(request,response)=>put(request,response),addAll:async(requests)=>{for(const url of requests)put(url,new Response(url.includes('.js')?'JS':'HTML'));}};
  vm.runInNewContext(sw,{self:{location:{origin:'https://billybillsai.com'},addEventListener:(name,fn)=>{events[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},URL,Response,caches:{open:async()=>cacheStore,match:async request=>cache.get(typeof request==='string'?request:request.url),keys:async()=>[],delete:async()=>true},fetch:async request=>{if(!online)throw Error('offline');const url=typeof request==='string'?request:request.url;return new Response(url.includes('index.html')?'<script src="/assets/entry.js"></script><link href="/assets/style.css" rel="stylesheet">':'JS');}});
  let pending;events.install({waitUntil:p=>{pending=p;}});await pending;
  assert.ok(cache.has('https://billybillsai.com/assets/entry.js'));
  online=false;let response;
  events.fetch({request:{method:'GET',url:'https://billybillsai.com/assets/entry.js',mode:'cors'},respondWith:p=>{response=p;}});
  assert.equal(await (await response).text(),'JS');
  events.fetch({request:{method:'GET',url:'https://billybillsai.com/assets/missing.js',mode:'cors'},respondWith:p=>{response=p;}});
  assert.equal((await response).status,503);
  let intercepted=false;events.fetch({request:{method:'GET',url:'https://billybillsai.com/api/transactions',mode:'cors'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});

function productionHandler(path,name,dependencies) {
  const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(found);
  const context=vm.createContext({...dependencies});vm.runInContext(ts.transpileModule(`${found}\nglobalThis.handler=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return context.handler;
}
test('website manual submit accepts decimal/Arabic amounts, validates dates and guards double submit',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});
  const utils=load(read('lib/api-client-react/src/voice-utils.ts'));
  const form={type:'expense',amount:'١٢٫٥٠',currency:'AED',accountId:'11',date:'2026-11-01',status:'settled'};
  const submit=productionHandler('artifacts/finance-app/src/pages/new-transaction.tsx','handleManualSubmit',{manualForm:form,normalizeAmountInput:utils.normalizeAmountInput,transactionError:manual.transactionError,manualErrorMessage:manual.manualErrorMessage,settings:{currencies:['AED']},draft:{ready:true,id,restore(){}},userId:'a',saveInFlightRef:{current:false},saveAnotherRef:{current:false},setSavingLocal(){},toast(){},language:'ar',webLedger:{async enqueue(_owner,payload){calls++;assert.equal(payload.amount,12.5);await pending;},uuid:()=>id,saveDraft:async()=>{}},localISODate:()=>base.date,setLocation(){}});
  const first=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(calls,1);release();await first;
  form.date='2026-02-31';await submit({preventDefault(){}});assert.equal(calls,1);
});
test('native storage adapter serializes concurrent writes without losing queued data',async()=>{
  const data=new Map();const adapter={async getItem(key){await tick();return data.get(key)??null;},async setItem(key,value){await tick();data.set(key,value);},async removeItem(key){data.delete(key);}};
  const native=load(read('artifacts/finance-mobile/lib/offline-ledger.ts'),{'@react-native-async-storage/async-storage':adapter,'expo-crypto':{randomUUID:()=>id},'@workspace/api-client-react':core}).mobileLedger;
  await Promise.all([native.storage.update('a',record=>({...record,outbox:[...record.outbox,{id:'first'}]})),native.storage.update('a',record=>({...record,outbox:[...record.outbox,{id:'second'}]}))]);
  assert.deepEqual(clone((await native.read('a')).outbox.map(item=>item.id)),['first','second']);assert.equal((await native.read('b')).outbox.length,0);
});

test('draft hook restores existing values before autosaving and hides them from a different user',async()=>{
  const storage=memoryStorage();const ledger=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);
  const initial={type:'expense',amount:'',currency:'AED',date:'2026-11-01',status:'pending',accountId:'',toAccountId:'',clientId:'',tripId:'',description:''};
  await ledger.saveDraft('a',id,{...initial,amount:'77.50',accountId:'11'});
  const slots=[],effects=[];let cursor=0;
  const react={useState(value){const index=cursor++;if(!(index in slots))slots[index]=value;return [slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef(value){const index=cursor++;return slots[index]??=( {current:value} );},useEffect(fn,deps){const index=cursor++;const old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){old?.cleanup?.();const state={deps};slots[index]=state;effects.push(()=>{state.cleanup=fn();});}}};
  const hook=load(read('lib/api-client-react/src/use-offline-ledger.ts'),{react,'./offline-ledger':core}).useManualDraft;
  const render=owner=>{cursor=0;const result=hook(ledger,owner,initial);while(effects.length)effects.shift()();return result;};
  let result=render('a');assert.equal(result[2].ready,false);await tick();result=render('a');await tick();
  assert.equal(result[0].amount,'77.50');assert.equal((await ledger.read('a')).draft.values.amount,'77.50');
  result[1](old=>({...old,amount:'88.25'}));result=render('a');await tick();assert.equal((await ledger.read('a')).draft.values.amount,'88.25');
  result=render('b');assert.equal(result[0].amount,'');assert.equal(result[2].ready,false);await tick();result=render('b');await tick();assert.equal(result[0].amount,'');assert.equal((await ledger.read('a')).draft.values.amount,'88.25');
});

test('rapid login/logout writes the final offline identity in order',async()=>{
  const storage=memoryStorage();const original=storage.activeOwner;
  storage.activeOwner=async(value)=>{if(value==='a')await new Promise(resolve=>setTimeout(resolve,10));return original(value);};
  const ledger=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);
  await Promise.all([ledger.activate('a'),ledger.activate(null)]);
  assert.equal(await storage.activeOwner(),null);
});

test('debt collection allocates 150 across 100 and 200 FIFO, retries do not allocate twice',async()=>{
 const server=transactionServer();server.records.get(server.tables.clientsTable).push({id:7,userId:'a',name:'محمد'});
 const debts=server.records.get(server.tables.transactionsTable);
 debts.push({id:100,date:'2026-01-01',type:'receivable',amount:'100',currency:'AED',clientId:7,userId:'a',debtKind:'sale'},{id:200,date:'2026-02-01',type:'receivable',amount:'200',currency:'AED',clientId:7,userId:'a',debtKind:'sale'});
 const payload={...base,type:'income',clientId:7,amount:150,clientRequestId:id};
 const first=await server.call(payload);assert.equal(first.status,201);assert.deepEqual(clone(first.body.allocations),[{debtId:100,amount:100},{debtId:200,amount:50}]);assert.match(first.body.collectionSummary,/150.00/);
 const again=await server.call(payload);assert.equal(again.status,200);assert.equal(debts.filter(t=>t.type==='income').length,1);
 const math=load(read('artifacts/api-server/src/lib/debt-math.ts'));assert.equal(math.debtBalances(debts).reduce((s,d)=>s+d.remaining,0),150);
 assert.equal(debts.reduce((s,t)=>s+math.revenueAmount(t),0),300);
});
test('concurrent collections cannot overpay; a collection without debts cannot become income silently',async()=>{
 const s=transactionServer();s.records.get(s.tables.clientsTable).push({id:7,userId:'a',name:'محمد'});s.records.get(s.tables.transactionsTable).push({id:100,date:'2026-01-01',type:'receivable',amount:'100',currency:'AED',clientId:7,userId:'a',debtKind:'sale'});
 const results=await Promise.all([s.call({...base,type:'income',clientId:7,amount:75}),s.call({...base,type:'income',clientId:7,amount:75})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const other=await s.call({...base,type:'income',clientId:7,currency:'USD',amount:5});assert.equal(other.status,409);
 const empty=await s.call({...base,type:'income',collectionOnly:true,amount:5});assert.equal(empty.status,409);
});
test('new receivable records no cash account and cannot use another owner person',async()=>{
 const s=transactionServer();s.records.get(s.tables.clientsTable).push({id:7,userId:'a',name:'محمد'});
 const r=await s.call({...base,type:'receivable',debtKind:'sale',clientId:7,accountId:0,amount:100});assert.equal(r.status,201);assert.equal(r.body.accountId,null);
 const invalid=await s.call({...base,type:'receivable',debtKind:'sale',clientId:8,accountId:0,amount:100});assert.equal(invalid.status,400);
});
test('debt drafts persist separately and syncing a debt never clears an ordinary draft',async()=>{const storage=memoryStorage();const ledger=new core.OfflineLedger(storage,()=>id,async()=>{},()=>false);const ordinary={type:'expense',amount:'50'};const debt={type:'receivable',amount:'100',debtKind:'sale'};await ledger.saveDraft('a','ordinary',ordinary);await ledger.saveDraft('a',id,debt,'debtDraft');await ledger.enqueue('a',{...base,type:'receivable',debtKind:'sale'},id);const r=await ledger.read('a');assert.equal(r.draft.values.amount,'50');assert.equal(r.debtDraft,null);assert.equal(r.outbox[0].payload.debtKind,'sale');});
test('offline receivable type requires origin and person, skips cash account except for newly funded loans',()=>{const debt={...base,type:'receivable',debtKind:'sale',clientId:7,accountId:0};assert.equal(manual.transactionError(debt),null);assert.equal(manual.transactionError({...debt,clientId:null}),'invalid_receivable');assert.equal(manual.transactionError({...debt,debtKind:'loan_now'}),'account_required');assert.equal(manual.transactionError({...debt,debtKind:'loan_now',accountId:11}),null);assert.equal(manual.transactionError({...debt,dueDate:'2026-02-31'}),'invalid_receivable');});
test('opening inclusion flags survive the real API and retry without duplicate cash records',async()=>{const s=transactionServer();const input={...base,includedInOpeningBalance:true,clientRequestId:id};const a=await s.call(input);assert.equal(a.status,201);assert.equal(a.body.includedInOpeningBalance,true);assert.equal((await s.call(input)).status,200);assert.equal(s.records.get(s.tables.transactionsTable).length,1);});
test('an existing expense can be corrected as already included without deleting history',async()=>{const s=transactionServer();const saved=await s.call(base);const fixed=await s.patch(saved.body.id,{includedInOpeningBalance:true});assert.equal(fixed.status,200);assert.equal(fixed.body.includedInOpeningBalance,true);assert.equal(fixed.body.amount,12.5);assert.equal(fixed.body.date,base.date);assert.equal(s.records.get(s.tables.transactionsTable).length,1);});
test('opening-balance cash correction preserves collection links and outstanding debt',async()=>{const s=transactionServer();s.records.get(s.tables.clientsTable).push({id:7,userId:'a',name:'محمد'});s.records.get(s.tables.transactionsTable).push({id:100,type:'receivable',debtKind:'sale',amount:'100',clientId:7,currency:'AED',date:'2026-01-01',userId:'a'});const saved=await s.call({...base,type:'income',clientId:7,amount:50});s.records.get(s.tables.transactionsTable).find(t=>t.id===saved.body.id).amount='50.00';const fixed=await s.patch(saved.body.id,{...base,type:'income',clientId:7,amount:50,includedInOpeningBalance:true});assert.equal(fixed.status,200);assert.equal(fixed.body.includedInOpeningBalance,true);assert.deepEqual(clone(fixed.body.allocations),[{debtId:100,amount:50}]);const changed=await s.patch(saved.body.id,{amount:25});assert.equal(changed.status,409);});
test('retries committed by the previous API version still match the legacy hash when inclusion is false',async()=>{const s=transactionServer();const values={userId:'a',type:base.type,amount:String(base.amount),currency:base.currency,date:base.date,status:base.status,description:null,clientId:null,tripId:null,debtKind:null,dueDate:null,accountId:base.accountId,toAccountId:null};const hash=requireServer('node:crypto').createHash('sha256').update(JSON.stringify({...values,collectionOnly:false})).digest('hex');s.records.get(s.tables.transactionReceiptsTable).push({userId:'a',requestId:id,payloadHash:hash,response:{id:44,...base}});const result=await s.call({...base,clientRequestId:id});assert.equal(result.status,200);assert.equal(result.body.id,44);assert.equal(s.records.get(s.tables.transactionsTable).length,0);assert.equal((await s.call({...base,clientRequestId:id,includedInOpeningBalance:true})).status,409);});
