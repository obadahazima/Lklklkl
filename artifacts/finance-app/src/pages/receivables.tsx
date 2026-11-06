import { formatNumber } from "@workspace/api-client-react";
import { OpeningBalanceOptions } from "@/components/opening-balance-options";
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTransactions, useListClients, useListAccounts, useOfflineLedger, useManualDraft, normalizeAmountInput, localISODate, receivableBalances, receivableStatus } from "@workspace/api-client-react";
import { webLedger } from "@/lib/offline-ledger";
import { OfflineQueuePanel } from "@/components/offline-ledger";
import { useSettings } from "@/contexts/settings-context";
import { QueryFeedback } from "@/components/query-feedback";
import { useToast } from "@/hooks/use-toast";
export default function Receivables() {
 const { userId }=useAuth(); const {settings}=useSettings(); const ar=settings.language==='ar'; const {toast}=useToast(); const qc=useQueryClient();
 const list=useListTransactions(); const clients=useListClients(); const accounts=useListAccounts(); const offline=useOfflineLedger(webLedger,userId);
 const rows=list.data ?? offline.record.references.transactions ?? [];
 const people=clients.data ?? offline.record.references.clients ?? []; const wallets=accounts.data ?? offline.record.references.accounts ?? [];
 const debts=receivableBalances(rows);
 const totals=Object.values(debts.reduce<Record<string,{clientId:number|null|undefined;currency:string;amount:number}>>((acc,d)=>{const key=`${d.clientId}:${d.currency}`;const item=acc[key]??{clientId:d.clientId,currency:d.currency,amount:0};item.amount=Math.round((item.amount+d.remaining)*100)/100;acc[key]=item;return acc;},{}));
 const [form,setForm,draft]=useManualDraft(webLedger,userId,{includedInOpeningBalance:'',destinationIncludedInOpeningBalance:'',type:'receivable',amount:'',currency:settings.primaryCurrency,clientId:'',tripId:'',accountId:'',toAccountId:'',description:'',status:'pending',date:localISODate(),debtKind:'sale',dueDate:''},'debtDraft');
 const [busy,setBusy]=useState(false); const [collection,setCollection]=useState(false);
 const field='w-full rounded-xl border border-border bg-background p-3';
 async function save(e:React.FormEvent) {
  e.preventDefault(); if(!userId||!draft.ready||busy)return;
  const amount=normalizeAmountInput(form.amount); const clientId=Number(form.clientId);
  if(!Number.isFinite(amount)||amount<=0||amount>=1e13||!people.some(c=>c.id===clientId)||((collection||form.debtKind==='loan_now')&&!wallets.some(a=>a.id===Number(form.accountId)))|| (form.dueDate && form.dueDate<form.date)) {toast({title:ar?'راجع المبلغ والشخص والحساب والتاريخ':'Check amount, person, account and dates',variant:'destructive'});return;}
  setBusy(true);
  try {
   await webLedger.enqueue(userId,{includedInOpeningBalance:form.includedInOpeningBalance === 'true',type:collection?'income':'receivable',collectionOnly:collection,amount,currency:form.currency,clientId,tripId:null,accountId:collection||form.debtKind==='loan_now'?Number(form.accountId):0,toAccountId:null,description:form.description||null,date:form.date,status:collection?'settled':'pending',debtKind:collection?null:form.debtKind,dueDate:collection?null:form.dueDate||null},draft.id);
   draft.reset({...form,amount:'',description:'',dueDate:'',includedInOpeningBalance:''}); await qc.invalidateQueries();
   toast({title:ar?'حُفظت على الجهاز؛ يظهر التوزيع والرصيد بعد المزامنة':'Saved locally; allocation and balance appear after syncing'});
  }catch {toast({title:ar?'تعذر الحفظ؛ حاول مجدداً':'Save failed; retry',variant:'destructive'});}finally{setBusy(false);}
 }
 return <div className="p-4 pb-24 max-w-3xl mx-auto space-y-5" dir={ar?'rtl':'ltr'}>
  <h1 className="text-2xl font-bold">{ar?'الذمم':'Receivables'}</h1>
  <p className="text-sm text-muted-foreground">{ar?'مبالغ مستحقة لدى الغير. تسجيل الذمة لا يزيد رصيد الحساب؛ التحصيل يزيد الحساب ويخفض الذمم، من الأقدم للأحدث بنفس العملة.':'Amounts owed to you. Recording a receivable does not increase cash. Collections settle the oldest debts first in the same currency.'}</p>
  <div className="grid sm:grid-cols-2 gap-3">{totals.filter(t=>t.amount>0).map(t=><div key={`${t.clientId}:${t.currency}`} className="rounded-xl bg-primary/10 p-3"><strong>{people.find(p=>p.id===t.clientId)?.name||"—"}</strong><p>{ar?"إجمالي الذمم المتبقية: ":"Total outstanding: "}{formatNumber(t.amount, 2)} {t.currency}</p></div>)}</div>
  {list.isError&&list.data&&<QueryFeedback ar={ar} retry={list.refetch} cached/>}
  <OfflineQueuePanel owner={userId} ar={ar} cached={!list.data}/>
  <div className="flex gap-2">{[false,true].map(v=><button key={String(v)} className={`rounded-xl p-3 font-semibold ${collection===v?'bg-primary text-primary-foreground':'bg-muted'}`} onClick={()=>{setCollection(v);draft.reset({...form,type:v?'income':'receivable',amount:''});}}>{v?(ar?'تسجيل تحصيل':'Record collection'):(ar?'تسجيل ذمة':'Record receivable')}</button>)}</div>
  <form onSubmit={save} className="bg-card border border-border rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
   <label>{ar?'الشخص':'Person'}<select required className={field} value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})}><option value="">{ar?'اختر شخصاً':'Choose person'}</option>{people.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>{ar?'المبلغ':'Amount'}<input required className={field} inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
   <label>{ar?'العملة':'Currency'}<select className={field} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{settings.currencies.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>{ar?'التاريخ':'Date'}<input required type="date" className={field} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
   {!collection&&<><label>{ar?'أصل الذمة':'Origin'}<select className={field} value={form.debtKind} onChange={e=>setForm({...form,debtKind:e.target.value})}>{[['sale',ar?'بيع أو خدمة آجلة':'Credit sale/service'],['opening',ar?'ذمة سابقة — بدون إيراد جديد':'Opening debt — no new revenue'],['loan',ar?'سلفة سابقة':'Existing loan'],['loan_now',ar?'سلفة أعطيتها الآن':'Loan issued now']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>{ar?'تاريخ الاستحقاق (اختياري)':'Due date (optional)'}<input type="date" min={form.date} className={field} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label></>}
   {(collection||form.debtKind==='loan_now')&&<label>{collection?(ar?'حساب الاستلام':'Deposit account'):(ar?'حساب خروج السلفة':'Loan funding account')}<select required className={field} value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})}><option value="">{ar?'اختر الحساب':'Choose account'}</option>{wallets.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>}
   <label>{ar?'الوصف':'Description'}<input className={field} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
   <p className="sm:col-span-2 text-sm text-muted-foreground">{collection?(ar?'الدفعة ستُوزع تلقائياً على ذمم الشخص الأقدم بنفس العملة. إذا ما عليه ذمم، استخدم تسجيل إيراد.':'Payment allocates to the oldest debts in this currency. Use income entry if no debts exist.'):(form.debtKind==='loan_now'?(ar?'سينقص الحساب بقيمة السلفة، وتبقى ذمة على الشخص. ليست مصروفاً.':'The loan reduces cash and creates a receivable, not an expense.'):(ar?'لا حركة نقدية الآن. البيع الآجل يسجّل الإيراد مرة واحدة؛ الذمة السابقة والسلفة لا تضيفان إيراداً.':'No cash movement now. Credit sales recognize revenue once; opening debts and loans add no revenue.'))}</p>
<div className="sm:col-span-2">{(collection||form.debtKind === "loan_now")&&<OpeningBalanceOptions accounts={wallets} accountId={form.accountId} type={collection?"income":"receivable"} date={form.date} source={form.includedInOpeningBalance} onSource={v=>setForm(f=>({...f,includedInOpeningBalance:v}))} onDestination={()=>{}} ar={ar}/>}</div>
   <button disabled={busy||!draft.ready} className="sm:col-span-2 rounded-xl bg-primary text-primary-foreground p-3 font-semibold disabled:opacity-50">{busy?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'حفظ':'Save')}</button>
  </form>
  {list.isError&&!list.data&&rows.length===0?<QueryFeedback ar={ar} retry={list.refetch}/>:list.isLoading&&rows.length===0?<p>{ar?'جارٍ التحميل…':'Loading…'}</p>:debts.length===0?<p>{ar?'لا توجد ذمم مسجّلة بعد.':'No receivables recorded.'}</p>:debts.map(d=><article key={d.id} className="rounded-2xl border border-border bg-card p-4 space-y-2"><div className="flex flex-wrap justify-between gap-2"><strong>{people.find(c=>c.id===d.clientId)?.name||d.clientName||'—'}</strong><span>{receivableStatus(d.remaining,d.collected,d.dueDate,localISODate(),ar)}</span></div><p>{d.description}</p><p>{ar?'الأصل':'Original'}: {formatNumber(d.amount, 2)} · {ar?'المحصّل':'Collected'}: {formatNumber(d.collected, 2)} · <strong>{ar?'المتبقي':'Remaining'}: {formatNumber(d.remaining, 2)} {d.currency}</strong></p><div className="text-xs text-muted-foreground space-y-1">{rows.flatMap(tx=>(tx.allocations??[]).filter(a=>a.debtId===d.id).map(a=><p key={tx.id}>{ar?'تحصيل':'Collection'}: {formatNumber(a.amount, 2)} {d.currency} · {tx.date} · {wallets.find(w=>w.id===tx.accountId)?.name||'—'}</p>))}</div><p className="text-xs text-muted-foreground">{d.date}{d.dueDate?` · ${ar?'الاستحقاق':'Due'}: ${d.dueDate}`:''}</p>{d.remaining>0&&<button className="text-primary underline" onClick={()=>{setCollection(true);draft.reset({...form,type:'income',clientId:String(d.clientId),currency:d.currency,amount:'',date:localISODate()});window.scrollTo({top:0,behavior:'smooth'});}}>{ar?'تسجيل تحصيل':'Record collection'}</button>}</article>)}
 </div>;
}
