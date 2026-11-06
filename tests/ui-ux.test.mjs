import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const requireWeb=createRequire(new URL('artifacts/finance-app/package.json',root));
const React=requireWeb('react');
const {renderToStaticMarkup}=requireWeb('react-dom/server');
function load(path,overrides={}){
 const exports={};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:id=>id in overrides?overrides[id]:requireWeb(id),window:{matchMedia:()=>({matches:true})},navigator:{onLine:true},console,URLSearchParams});return exports;
}
const presentation=load('lib/api-client-react/src/presentation.ts');
const utils=load('lib/api-client-react/src/voice-utils.ts');
const credit=load('lib/api-client-react/src/account-credit.ts',{'./voice-utils':utils});
const manual=load('lib/api-client-react/src/manual-entry.ts');
function handler(path,name,deps){const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found);const ctx=vm.createContext(deps);vm.runInContext(ts.transpileModule(found+`\nglobalThis.handler=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx.handler;}
test('editing real transactions preserves account data and validates Arabic amounts, dates and transfers',()=>{
 let saved,errors=0;const form={type:'expense',amount:'١٢٫٥٠',currency:'AED',status:'settled',date:'2026-11-01',description:' Test ',accountId:'11',toAccountId:'22',clientId:'3',tripId:'4'};
 const submit=handler('artifacts/finance-app/src/pages/transactions.tsx','handleSubmit',{form,isSaving:false,language:'ar',toast:()=>errors++,normalizeAmountInput:utils.normalizeAmountInput,transactionError:manual.transactionError,manualErrorMessage:manual.manualErrorMessage,onSave:patch=>{saved=patch;}});
 submit();assert.equal(saved.amount,12.5);assert.equal(saved.accountId,11);assert.equal(saved.toAccountId,null);assert.equal(saved.description,'Test');
 saved=null;form.amount='12.55001';submit();assert.equal(saved,null);
 form.amount='12';form.date='2026-02-31';submit();assert.equal(saved,null);
 form.date='2026-11-01';form.type='transfer';form.toAccountId='11';submit();assert.equal(saved,null);
 form.toAccountId='22';submit();assert.equal(saved.toAccountId,22);assert.equal(saved.clientId,null);assert.equal(saved.tripId,null);assert.equal(errors,3);
});
test('opening balance entry accepts signed Arabic decimals and never silently turns malformed input into zero',()=>{
 const state={initialBalance:'-١٬٥٠٠٫٥٠'};let saved,errors=0;
 const deps={...credit,creditLimit:'',openingBalanceDate:'2026-11-06',name:'Cash',type:'cash',currency:'AED',color:'#216047',primaryCurrency:'AED',editingId:null,language:'ar',normalizeAmountInput:utils.normalizeAmountInput,toast:()=>errors++,createMutation:{isPending:false,mutate:input=>saved=input.data},updateMutation:{isPending:false}};
 Object.defineProperty(deps,'initialBalance',{get:()=>state.initialBalance});
 const save=handler('artifacts/finance-app/src/pages/accounts.tsx','handleSave',deps);
 save();assert.equal(saved.initialBalance,-1500.5);
 for(const value of ['50abc','١٢٫٥٥٥','NaN']){saved=null;state.initialBalance=value;save();assert.equal(saved,null);}assert.equal(errors,3);
});
const settings={language:'ar',primaryCurrency:'AED',currencies:['AED'],manualRates:{AED:1},showClients:true,showTrips:true,exchangeRateMode:'manual'};
const queryFeedback=load('artifacts/finance-app/src/components/query-feedback.tsx').QueryFeedback;
const i18n=load('artifacts/finance-app/src/lib/i18n.ts');
const common={
 '@/hooks/use-account-order':{useAccountOrder:accounts=>({rows:accounts??[],saving:false,draggingId:null,gripProps:()=>({})})},
 '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries(){}})},
 '@/hooks/use-toast':{useToast:()=>({toast(){}})},
 '@/contexts/settings-context':{useSettings:()=>({settings,effectiveRates:{AED:1}})},
 '@/lib/i18n':i18n,
 '@/lib/utils':{cn:(...xs)=>xs.filter(x=>typeof x==='string').join(' ')},
 '@/components/query-feedback':{QueryFeedback:queryFeedback},
 '@/components/opening-balance-options':{OpeningBalanceOptions:()=>null},
};
for(const [page,entity] of [['accounts','Accounts'],['clients','Clients'],['trips','Trips']]){
 test(`${page} renders a retryable failure instead of a false empty financial list`,()=>{
  const api=new Proxy({}, {get:(_,key)=>key==='formatNumber'?presentation.formatNumber:key==='normalizeAmountInput'?utils.normalizeAmountInput:()=>key===`useList${entity}`?{isError:true,isLoading:false,data:undefined,refetch:async()=>{}}:{isPending:false,mutate(){}}});
  const Component=load(`artifacts/finance-app/src/pages/${page}.tsx`,{...common,'@workspace/api-client-react':api}).default;
  const html=renderToStaticMarkup(React.createElement(Component));assert.match(html,/role="alert"/);assert.match(html,/إعادة المحاولة/);assert.doesNotMatch(html,/ما في حسابات بعد|لا يوجد زبائن|لا توجد رحلات/);
 });
}
function hsl(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l);return [0,8,4].map(n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));});}
function luminance(rgb){return rgb.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('light and dark themes keep normal foreground, muted text and primary buttons above 4.5:1 contrast',()=>{
 const css=read('artifacts/finance-app/src/index.css');
 for(const selector of [':root','.dark']){
  const body=css.slice(css.indexOf(selector+' {')).split('}')[0];const vars={};
  for(const m of body.matchAll(/--([\w-]+):\s*([\d.]+) ([\d.]+)% ([\d.]+)%;/g))vars[m[1]]=hsl(...m.slice(2).map(Number));
  for(const [fg,bg]of [['foreground','background'],['muted-foreground','background'],['muted-foreground','card'],['primary-foreground','primary']])assert.ok(contrast(vars[fg],vars[bg])>=4.5,`${selector} ${fg}/${bg}: ${contrast(vars[fg],vars[bg])}`);
 }
});
test('real account save accepts either credit sign and sends the optional limit separately',()=>{
 const state={initialBalance:'500',creditLimit:'٢٠٠٠'};let saved,errors=0;
 const deps={...credit,openingBalanceDate:'2026-11-06',name:'Visa',type:'credit',currency:'AED',color:'#216047',primaryCurrency:'AED',editingId:null,language:'ar',toast:()=>errors++,createMutation:{isPending:false,mutate:input=>saved=input.data},updateMutation:{isPending:false}};
 for(const key of ['initialBalance','creditLimit'])Object.defineProperty(deps,key,{get:()=>state[key]});
 const save=handler('artifacts/finance-app/src/pages/accounts.tsx','handleSave',deps);
 for(const input of ['500','-500','-٥٠٠']){state.initialBalance=input;save();assert.equal(saved.initialBalance,-500);assert.equal(saved.creditLimit,2000);}
 state.creditLimit='';save();assert.equal(saved.creditLimit,null);
 state.creditLimit='-20';saved=null;save();assert.equal(saved,null);assert.equal(errors,1);
});
test('receivables page renders remaining 150 after a FIFO collection and keeps cash and accrual explanation visible',()=>{
 const helpers=load('lib/api-client-react/src/receivables.ts');
 const rows=[{id:1,type:'receivable',date:'2026-01-01',amount:100,clientId:7,currency:'AED',debtKind:'sale'},{id:2,type:'receivable',date:'2026-02-01',amount:200,clientId:7,currency:'AED',debtKind:'sale'},{id:3,type:'income',date:'2026-03-01',amount:150,clientId:7,currency:'AED',accountId:11,allocations:[{debtId:1,amount:100},{debtId:2,amount:50}]}];
 const api={...presentation,...helpers,...utils,useListTransactions:()=>({data:rows}),useListClients:()=>({data:[{id:7,name:'محمد'}]}),useListAccounts:()=>({data:[{id:11,name:'الكاش'}]}),useOfflineLedger:()=>({record:{outbox:[],references:{}}}),useManualDraft:(_ledger,_owner,initial)=>[initial,()=>{},{ready:true}],};
 const Component=load('artifacts/finance-app/src/pages/receivables.tsx',{...common,'@clerk/react':{useAuth:()=>({userId:'a'})},'@workspace/api-client-react':api,'@/lib/offline-ledger':{webLedger:{}},'@/components/offline-ledger':{OfflineQueuePanel:()=>null}}).default;
 const html=renderToStaticMarkup(React.createElement(Component));assert.match(html,/الذمم/);assert.match(html,/إجمالي الذمم المتبقية: 150.00/);assert.match(html,/محصّلة بالكامل/);assert.match(html,/محصّلة جزئياً/);assert.match(html,/تسجيل تحصيل/);assert.match(html,/تسجيل الذمة لا يزيد رصيد الحساب/);
});
test('opening-balance review automatically checks and locks both sides when before their snapshot dates',()=>{const {OpeningBalanceOptions}=load('artifacts/finance-app/src/components/opening-balance-options.tsx');const html=renderToStaticMarkup(React.createElement(OpeningBalanceOptions,{accounts:[{id:1,name:'البنك',openingBalanceDate:'2026-11-06'},{id:2,name:'الكاش',openingBalanceDate:'2026-11-05'}],accountId:'1',toAccountId:'2',type:'transfer',date:'2026-11-04',source:'true',destination:'',onSource(){},onDestination(){},ar:true}));assert.equal((html.match(/type="checkbox"/g)??[]).length,2);assert.equal((html.match(/checked=""/g)??[]).length,2);assert.equal((html.match(/disabled=""/g)??[]).length,2);assert.match(html,/محسوبة تلقائياً/);assert.match(html,/البنك/);assert.match(html,/الكاش/);assert.match(html,/ستبقى بالتقارير بتاريخها/);});
