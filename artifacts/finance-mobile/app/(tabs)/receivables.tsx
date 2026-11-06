import { OpeningBalanceOptions } from "@/components/OpeningBalanceOptions";
import React, {useState} from 'react';
import {ScrollView,Text,TextInput,Pressable,View,Alert} from 'react-native';
import {useAuth} from '@clerk/expo';
import {useListTransactions,useListClients,useListAccounts,useOfflineLedger,useManualDraft,normalizeAmountInput,localISODate,receivableBalances,receivableStatus} from '@workspace/api-client-react';
import {mobileLedger} from '@/lib/offline-ledger';
import {useSettings} from '@/contexts/SettingsContext';
import {useColors} from '@/hooks/useColors';
import {OfflineQueuePanel} from '@/components/OfflineLedger';
export default function Receivables(){
 const {userId}=useAuth();const {settings}=useSettings();const c=useColors();const ar=settings.language==='ar';const list=useListTransactions();const peopleQuery=useListClients();const accountsQuery=useListAccounts();const offline=useOfflineLedger(mobileLedger,userId);
 const debts=receivableBalances(list.data??offline.record.references.transactions??[]);const people=peopleQuery.data??offline.record.references.clients??[];const accounts=accountsQuery.data??offline.record.references.accounts??[];
 const [collection,setCollection]=useState(false);const [busy,setBusy]=useState(false);
 const [f,setF,draft]=useManualDraft(mobileLedger,userId,{includedInOpeningBalance:'',type:'receivable',amount:'',currency:settings.primaryCurrency,clientId:'',accountId:'',toAccountId:'',tripId:'',description:'',status:'pending',date:localISODate(),dueDate:'',debtKind:'sale'},'debtDraft');
 const text={color:c.foreground,textAlign:ar?'right' as const:'left' as const};const input={borderWidth:1,borderColor:c.border,borderRadius:10,padding:12,color:c.foreground};
 const choose=(field:'clientId'|'accountId'|'currency'|'debtKind',choices:{value:string;label:string}[])=> <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{choices.map(o=><Pressable key={o.value} onPress={()=>setF({...f,[field]:o.value})} style={{padding:10,borderRadius:10,borderWidth:1,borderColor:f[field]===o.value?c.primary:c.border,backgroundColor:f[field]===o.value?c.primary+'20':c.card}}><Text style={text}>{o.label}</Text></Pressable>)}</View>;
 async function save(){
  if(!userId||busy||!draft.ready)return;const amount=normalizeAmountInput(f.amount);
  if(!Number.isFinite(amount)||amount<=0||amount>=1e13||!people.some(p=>p.id===Number(f.clientId))||((collection||f.debtKind==='loan_now')&&!accounts.some(a=>a.id===Number(f.accountId)))){Alert.alert(ar?'راجع المبلغ والشخص والحساب':'Check amount, person and account');return;}
  setBusy(true);try{await mobileLedger.enqueue(userId,{includedInOpeningBalance:f.includedInOpeningBalance === 'true',type:collection?'income':'receivable',collectionOnly:collection,amount,currency:f.currency,clientId:Number(f.clientId),accountId:collection||f.debtKind==='loan_now'?Number(f.accountId):0,toAccountId:null,tripId:null,status:collection?'settled':'pending',date:f.date,description:f.description||null,debtKind:collection?null:f.debtKind,dueDate:collection?null:f.dueDate||null},draft.id);draft.reset({...f,amount:'',description:'',includedInOpeningBalance:''});Alert.alert(ar?'حُفظت على الجهاز':'Saved locally',ar?'بعد المزامنة يظهر التوزيع والمتبقي في قسم الذمم.':'Allocation and remaining balance appear after sync.');}catch{Alert.alert(ar?'تعذر الحفظ':'Save failed');}finally{setBusy(false);}
 }
 return <ScrollView keyboardShouldPersistTaps="handled" style={{flex:1,backgroundColor:c.background}} contentContainerStyle={{padding:20,paddingTop:60,paddingBottom:120,gap:12}}>
 <Text style={[text,{fontSize:26,fontWeight:'700'}]}>{ar?'الذمم':'Receivables'}</Text>
 <Text style={text}>{ar?'التحصيل يزيد الحساب ويخفض الذمم من الأقدم للأحدث بنفس العملة، بدون تكرار الإيراد.':'Collections increase cash and settle the oldest debts in the same currency, without duplicate revenue.'}</Text>
 <OfflineQueuePanel owner={userId} ar={ar}/>
 <View style={{flexDirection:'row',gap:12}}>{[false,true].map(v=><Pressable key={String(v)} onPress={()=>{setCollection(v);draft.reset({...f,type:v?'income':'receivable',amount:''});}} style={{padding:12,borderRadius:12,backgroundColor:collection===v?c.primary:c.card}}><Text style={{color:collection===v?'white':c.foreground}}>{v?(ar?'تسجيل تحصيل':'Record collection'):(ar?'تسجيل ذمة':'Record receivable')}</Text></Pressable>)}</View>
 <Text style={text}>{ar?'الشخص':'Person'}</Text>{choose('clientId',people.map(p=>({value:String(p.id),label:p.name})))}
 <Text style={text}>{ar?'المبلغ':'Amount'}</Text><TextInput accessibilityLabel={ar?'المبلغ':'Amount'} value={f.amount} onChangeText={amount=>setF({...f,amount})} keyboardType="decimal-pad" style={input}/>
 {choose('currency',settings.currencies.map(value=>({value,label:value})))}
 <Text style={text}>{ar?'التاريخ YYYY-MM-DD':'Date YYYY-MM-DD'}</Text><TextInput accessibilityLabel="Date" value={f.date} onChangeText={date=>setF({...f,date})} style={input}/>
 {!collection&&<><Text style={text}>{ar?'أصل الذمة':'Origin'}</Text>{choose('debtKind',[{value:'sale',label:ar?'بيع أو خدمة آجلة':'Credit sale/service'},{value:'opening',label:ar?'ذمة سابقة':'Opening debt'},{value:'loan',label:ar?'سلفة سابقة':'Existing loan'},{value:'loan_now',label:ar?'سلفة أعطيتها الآن':'Loan issued now'}])}<Text style={text}>{ar?'تاريخ الاستحقاق (اختياري) YYYY-MM-DD':'Due date (optional) YYYY-MM-DD'}</Text><TextInput value={f.dueDate} onChangeText={dueDate=>setF({...f,dueDate})} style={input}/></>}
 {(collection||f.debtKind==='loan_now')&&<><Text style={text}>{collection?(ar?'حساب الاستلام':'Deposit account'):(ar?'حساب خروج السلفة':'Funding account')}</Text>{choose('accountId',accounts.map(a=>({value:String(a.id),label:a.name+' · '+a.currency})))}</>}
 <TextInput accessibilityLabel={ar?'الوصف':'Description'} value={f.description} onChangeText={description=>setF({...f,description})} placeholder={ar?'الوصف':'Description'} placeholderTextColor={c.mutedForeground} style={input}/>
<OpeningBalanceOptions accounts={accounts} accountId={f.accountId} type={collection?"income":"receivable"} date={f.date} source={f.includedInOpeningBalance} onSource={v=>setF(f=>({...f,includedInOpeningBalance:v}))} onDestination={()=>{}} ar={ar}/>
 <Pressable disabled={busy||!draft.ready} onPress={save} style={{backgroundColor:c.primary,padding:14,borderRadius:12,opacity:busy?0.5:1}}><Text style={{color:'white',textAlign:'center'}}>{ar?'حفظ':'Save'}</Text></Pressable>
 {list.isError&&<Pressable onPress={()=>list.refetch()}><Text style={text}>{ar?'تعذر التحديث؛ اضغط لإعادة المحاولة. قد تكون البيانات المعروضة قديمة.':'Update failed; tap to retry. Displayed data may be stale.'}</Text></Pressable>}
 {debts.map(d=><View key={d.id} style={{padding:16,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.card,gap:8}}><Text style={[text,{fontWeight:'700'}]}>{people.find(p=>p.id===d.clientId)?.name??'—'} · {receivableStatus(d.remaining,d.collected,d.dueDate,localISODate(),ar)}</Text><Text style={text}>{ar?'الأصل':'Original'}: {d.amount.toFixed(2)} · {ar?'المحصّل':'Collected'}: {d.collected.toFixed(2)}</Text><Text style={text}>{ar?'المتبقي':'Remaining'}: {d.remaining.toFixed(2)} {d.currency}</Text><Text style={text}>{d.description}</Text>{(list.data??offline.record.references.transactions??[]).flatMap(tx=>(tx.allocations??[]).filter(a=>a.debtId===d.id).map(a=><Text key={tx.id} style={text}>{ar?"تحصيل":"Collection"}: {a.amount.toFixed(2)} {d.currency} · {tx.date}</Text>))}</View>)}
 </ScrollView>;
}
