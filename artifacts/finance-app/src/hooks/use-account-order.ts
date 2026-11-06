import {useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {customFetch,getListAccountsQueryKey,moveAccount,type Account} from '@workspace/api-client-react';
import {useToast} from '@/hooks/use-toast';
export function useAccountOrder(accounts:Account[]|undefined,ar:boolean){
 const [draft,setDraft]=useState<Account[]|null>(null);const [draggingId,setDraggingId]=useState<number|null>(null);const [saving,setSaving]=useState(false);
 const saved=useRef(false);const current=useRef<Account[]>([]);const gesture=useRef<{rows:Account[];centers:number[];from:number;startY:number}|null>(null);
 const qc=useQueryClient();const {toast}=useToast();const rows=draft??accounts??[];
 async function persist(next:Account[]){
  if(saved.current)return;saved.current=true;setSaving(true);setDraft(next);
  try{await customFetch('/api/accounts/reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountIds:next.map(a=>a.id)})});await qc.invalidateQueries({queryKey:getListAccountsQueryKey()});await qc.invalidateQueries({queryKey:['offline-reference']});toast({title:ar?'تم حفظ ترتيب الحسابات':'Account order saved'});}
  catch{await qc.invalidateQueries({queryKey:getListAccountsQueryKey()});toast({title:ar?'تعذر حفظ الترتيب؛ حدّث الحسابات وأعد المحاولة':'Could not save order; refresh and retry',variant:'destructive'});}
  finally{setDraft(null);saved.current=false;setSaving(false);}
 }
 const gripProps=(id:number)=>({
  disabled:saving,'aria-label':ar?'اسحب لترتيب الحساب، أو استخدم سهم أعلى وأسفل':'Drag to reorder account, or use Up and Down arrows',style:{touchAction:'none' as const},
  onPointerDown:(e:ReactPointerEvent<HTMLButtonElement>)=>{if(saved.current||e.button!==0)return;const from=rows.findIndex(a=>a.id===id);if(from<0)return;const centers=rows.map(a=>{const r=document.querySelector(`[data-account-id="${a.id}"]`)?.getBoundingClientRect();return r?r.top+r.height/2:0;});gesture.current={rows:[...rows],centers,from,startY:e.clientY};current.current=rows;setDraggingId(id);e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:ReactPointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g)return;const center=g.centers[g.from]+e.clientY-g.startY;const to=g.centers.reduce((best,y,i)=>Math.abs(y-center)<Math.abs(g.centers[best]-center)?i:best,0);current.current=moveAccount(g.rows,g.from,to);setDraft(current.current);},
  onPointerUp:()=>{const g=gesture.current;if(!g)return;gesture.current=null;setDraggingId(null);if(g.rows.some((a,i)=>a.id!==current.current[i]?.id))void persist(current.current);else setDraft(null);},
  onPointerCancel:()=>{gesture.current=null;setDraggingId(null);setDraft(null);},
  onKeyDown:(e:KeyboardEvent<HTMLButtonElement>)=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||saving)return;e.preventDefault();const from=rows.findIndex(a=>a.id===id),to=from+(e.key==='ArrowUp'?-1:1);if(to>=0&&to<rows.length)void persist(moveAccount(rows,from,to));},
 });
 return {rows,draggingId,saving,gripProps};
}
