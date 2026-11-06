import {useRef,useState} from 'react';import {Alert} from 'react-native';import {useQueryClient} from '@tanstack/react-query';
import {customFetch,getListAccountsQueryKey,moveAccount,type Account} from '@workspace/api-client-react';
export function useAccountOrder(accounts:Account[]|undefined,ar:boolean){
 const [draft,setDraft]=useState<Account[]|null>(null);const [draggingId,setDraggingId]=useState<number|null>(null);const [saving,setSaving]=useState(false);const savingRef=useRef(false);const layouts=useRef(new Map<number,{y:number;height:number}>());
 const current=useRef<Account[]>([]);const gesture=useRef<{rows:Account[];from:number;centers:number[]}|null>(null);const rows=draft??accounts??[];const qc=useQueryClient();
 async function persist(next:Account[]){if(savingRef.current)return;savingRef.current=true;setSaving(true);setDraft(next);try{await customFetch('/api/accounts/reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountIds:next.map(a=>a.id)})});await qc.invalidateQueries({queryKey:getListAccountsQueryKey()});await qc.invalidateQueries({queryKey:['offline-reference']});}catch{await qc.invalidateQueries({queryKey:getListAccountsQueryKey()});Alert.alert(ar?'تعذر حفظ ترتيب الحسابات؛ حدّثها وأعد المحاولة':'Could not save account order; refresh and retry');}finally{setDraft(null);setSaving(false);savingRef.current=false;}}
 function start(id:number){if(savingRef.current)return;let top=0;const centers=rows.map(a=>{const height=layouts.current.get(a.id)?.height??90;const center=top+height/2;top+=height+10;return center;});gesture.current={rows:[...rows],from:rows.findIndex(a=>a.id===id),centers};current.current=rows;setDraggingId(id);}
 function move(dy:number){const g=gesture.current;if(!g||g.from<0)return;const center=g.centers[g.from]+dy;const to=g.centers.reduce((best,y,i)=>Math.abs(y-center)<Math.abs(g.centers[best]-center)?i:best,0);current.current=moveAccount(g.rows,g.from,to);setDraft(current.current);}
 function end(){const g=gesture.current;if(!g)return;gesture.current=null;setDraggingId(null);if(g.rows.some((a,i)=>a.id!==current.current[i]?.id))void persist(current.current);else setDraft(null);}
 function cancel(){gesture.current=null;setDraggingId(null);setDraft(null);}
 function step(id:number,delta:number){const from=rows.findIndex(a=>a.id===id),to=from+delta;if(to>=0&&to<rows.length)void persist(moveAccount(rows,from,to));}
 return {rows,saving,draggingId,start,move,end,cancel,step,layout:(id:number,layout:{y:number;height:number})=>layouts.current.set(id,layout)};
}
