import { createTransaction, emptyLedger, OfflineLedger, type LedgerRecord, type LedgerStorage } from "@workspace/api-client-react";

let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("billy-ledger-v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("ledgers"); request.result.createObjectStore("meta"); };
    request.onblocked = () => { database = undefined; reject(new Error("Close older app tabs to open local storage")); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
function record(value: LedgerRecord | undefined): LedgerRecord {
  if (value === undefined) return emptyLedger();
  if (value.version !== 1 || !Array.isArray(value.outbox) || !value.references) throw new Error("Local ledger is unreadable; do not clear browser data before recovering it");
  return value;
}
export const webLedgerStorage: LedgerStorage = {
  async read(owner) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("ledgers", "readonly");
      const request = tx.objectStore("ledgers").get(owner);
      request.onsuccess = () => { try { resolve(record(request.result)); } catch (error) { reject(error); } };
      request.onerror = () => reject(request.error);
    });
  },
  async update(owner, change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("ledgers", "readwrite");
      const store = tx.objectStore("ledgers");
      const request = store.get(owner);
      let next: LedgerRecord;
      let failure: unknown;
      request.onsuccess = () => { try { next = change(record(request.result)); store.put(next, owner); } catch (error) { failure = error; tx.abort(); } };
      tx.oncomplete = () => { resolve(next); channel?.postMessage("changed"); };
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error);
    });
  },
  async activeOwner(owner) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", owner === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("meta");
      const request = owner === undefined ? store.get("activeOwner") : store.put(owner, "activeOwner");
      tx.oncomplete = () => resolve(owner === undefined ? request.result ?? null : owner);
      tx.onerror = () => reject(tx.error);
    });
  },
};
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("billy-ledger") : null;
export const webLedger = new OfflineLedger(webLedgerStorage, () => crypto.randomUUID(), (owner, input, signal) => createTransaction(input, { signal, headers: { "X-Offline-Owner": owner } }), () => navigator.onLine);
if (channel) channel.onmessage = () => webLedger.notify();
