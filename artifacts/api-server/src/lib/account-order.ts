import { db, accountsTable } from "@workspace/db";
import {eq,and,sql} from "drizzle-orm";
export async function ensureAccountOrder(){await db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.account-order.migration'))`);await tx.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 2147483647`);});}
export async function saveAccountOrder(userId:string,ids:number[]){
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.account-order'), hashtext(${userId}))`);
  const owned=await tx.select({id:accountsTable.id}).from(accountsTable).where(eq(accountsTable.userId,userId));
  const allowed=new Set(owned.map(a=>a.id));
  if(ids.length!==owned.length||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))return false;
  for(const [position,id]of ids.entries())await tx.update(accountsTable).set({position}).where(and(eq(accountsTable.id,id),eq(accountsTable.userId,userId)));
  return true;
 });
}
