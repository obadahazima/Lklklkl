import type { Account, Client, Trip, Transaction, TransactionInput } from "./generated/api.schemas";
import type { ManualDraft } from "./manual-entry";

export type QueuedTransaction = { id: string; payload: TransactionInput; state: "pending" | "blocked"; error?: string; status?: number; createdAt: string };
export type LedgerRecord = {
  version: 1;
  draft: { id: string; values: ManualDraft } | null;
  debtDraft?: { id: string; values: ManualDraft } | null;
  outbox: QueuedTransaction[];
  references: { consentVersion?: string; language?: "ar" | "en"; primaryCurrency?: string; currencies?: string[]; accounts?: Account[]; clients?: Client[]; trips?: Trip[]; transactions?: Transaction[]; updatedAt?: string };
};
export const emptyLedger = (): LedgerRecord => ({ version: 1, draft: null, outbox: [], references: {} });
export interface LedgerStorage {
  read(owner: string): Promise<LedgerRecord>;
  update(owner: string, change: (record: LedgerRecord) => LedgerRecord): Promise<LedgerRecord>;
  activeOwner(owner?: string | null): Promise<string | null>;
}
type Send = (owner: string, input: TransactionInput, signal: AbortSignal) => Promise<Transaction>;

/** Persist before sending. A lost response is retried with the SAME server idempotency key. */
export class OfflineLedger {
  syncRevision = 0;
  private listeners = new Set<() => void>();
  private owner: string | null = null;
  private activationTail: Promise<unknown> = Promise.resolve();
  private flushing = false;
  private controller: AbortController | null = null;
  constructor(readonly storage: LedgerStorage, readonly uuid: () => string, private send: Send, private online = () => true) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  notify = () => { for (const listener of this.listeners) listener(); };
  read = (owner: string) => this.storage.read(owner);
  async activate(owner: string | null) {
    if (this.owner !== owner) this.controller?.abort();
    this.owner = owner;
    const task = this.activationTail.catch(() => {}).then(() => this.storage.activeOwner(owner));
    this.activationTail = task;
    await task;
    this.notify();
    if (owner && this.owner === owner) void this.flush();
  }
  async erase(owner: string) {
    if (this.owner === owner) await this.activate(null);
    await this.storage.update(owner, () => emptyLedger());
    this.notify();
  }
  async saveDraft(owner: string, id: string, values: ManualDraft, slot: "draft" | "debtDraft" = "draft") {
    await this.storage.update(owner, (record) => ({ ...record, [slot]: { id, values } }));
  }
  async remember(owner: string, references: LedgerRecord["references"]) {
    await this.storage.update(owner, (record) => ({ ...record, references: { ...record.references, ...references, updatedAt: new Date().toISOString() } }));
    this.notify();
  }
  async enqueue(owner: string, payload: TransactionInput, id: string) {
    await this.storage.update(owner, (record) => {
      const existing = record.outbox.find((item) => item.id === id);
      if (existing && JSON.stringify(existing.payload) !== JSON.stringify({ ...payload, clientRequestId: id })) throw new Error("A queued transaction cannot be changed while syncing");
      return { ...record, draft: record.draft?.id === id ? null : record.draft, debtDraft: record.debtDraft?.id === id ? null : record.debtDraft, outbox: existing ? record.outbox : [...record.outbox, { id, payload: { ...payload, clientRequestId: id }, state: "pending", createdAt: new Date().toISOString() }] };
    });
    this.notify();
    void this.flush();
  }
  async retry(owner: string, id: string) {
    await this.storage.update(owner, (record) => ({ ...record, outbox: record.outbox.map((item) => item.id === id ? { ...item, state: "pending", error: undefined, status: undefined } : item) }));
    this.notify();
    void this.flush();
  }
  async recover(owner: string, id: string): Promise<{ id: string; values: ManualDraft }> {
    let draft: LedgerRecord["draft"] = null;
    await this.storage.update(owner, (record) => {
      const item = record.outbox.find((entry) => entry.id === id);
      // Only validation failures are known not to have committed. Never discard an uncertain write.
      if (!item || item.state !== "blocked" || ![400, 404, 422].includes(item.status ?? 0)) throw new Error("This transaction needs reconciliation before it can be edited");
      if (record.draft && Object.values(record.draft.values).some(Boolean) && record.draft.values.amount) throw new Error("Finish or clear the current draft first");
      const p = item.payload;
      draft = { id: this.uuid(), values: { includedInOpeningBalance: p.includedInOpeningBalance ? "true" : "", destinationIncludedInOpeningBalance: p.destinationIncludedInOpeningBalance ? "true" : "", type: p.type, amount: String(p.amount), currency: p.currency, date: p.date, status: p.status, accountId: String(p.accountId), toAccountId: p.toAccountId == null ? "" : String(p.toAccountId), clientId: p.clientId == null ? "" : String(p.clientId), tripId: p.tripId == null ? "" : String(p.tripId), description: p.description ?? "" } };
      return { ...record, draft, outbox: record.outbox.filter((entry) => entry.id !== id) };
    });
    this.notify();
    return draft!;
  }
  async flush() {
    if (this.flushing || !this.owner || !this.online()) return;
    this.flushing = true;
    const owner = this.owner;
    this.controller = new AbortController();
    try {
      const snapshot = await this.read(owner);
      for (const item of snapshot.outbox) {
        if (this.owner !== owner || this.controller.signal.aborted || !this.online()) break;
        if (item.state === "blocked") continue;
        const timeout = setTimeout(() => this.controller?.abort(), 15_000);
        try {
          const result = await this.send(owner, item.payload, this.controller.signal);
          if (this.owner !== owner || this.controller.signal.aborted) break;
          await this.storage.update(owner, (record) => ({ ...record, outbox: record.outbox.filter((entry) => entry.id !== item.id), references: { ...record.references, transactions: [result, ...(record.references.transactions ?? []).filter((tx) => tx.id !== result.id)], updatedAt: new Date().toISOString() } }));
          ++this.syncRevision;
          this.notify();
        } catch (err) {
          if (this.owner !== owner) break;
          const status = (err as { status?: number }).status;
          const permanent = status != null && [400, 404, 409, 422].includes(status);
          await this.storage.update(owner, (record) => ({ ...record, outbox: record.outbox.map((entry) => entry.id === item.id ? { ...entry, state: permanent ? "blocked" : "pending", status, error: permanent ? String((err as { data?: { error?: string } }).data?.error ?? "راجع بيانات المعاملة") : status === 401 || status === 403 ? "سجّل دخولك بنفس الحساب لإكمال المزامنة" : undefined } : entry) }));
          this.notify();
          // Authentication/network/server errors must wait for a later retry, not a tight loop.
          if (!permanent) break;
        } finally { clearTimeout(timeout); }
      }
    } catch { /* Persisted outbox stays intact when storage temporarily fails. */ }
    finally { this.flushing = false; this.controller = null; }
  }
}
