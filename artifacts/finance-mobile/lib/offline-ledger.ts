import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { createTransaction, emptyLedger, OfflineLedger, type LedgerRecord, type LedgerStorage } from "@workspace/api-client-react";

const tails = new Map<string, Promise<unknown>>();
const key = (owner: string) => `billy.ledger.v1.${owner}`;
const storage: LedgerStorage = {
  async read(owner) {
    const raw = await AsyncStorage.getItem(key(owner));
    if (!raw) return emptyLedger();
    const value: LedgerRecord = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.outbox) || !value.references) throw new Error("Local ledger is unreadable");
    return value;
  },
  update(owner, change) {
    const task = (tails.get(owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const next = change(await storage.read(owner));
      await AsyncStorage.setItem(key(owner), JSON.stringify(next));
      return next;
    });
    tails.set(owner, task);
    void task.finally(() => { if (tails.get(owner) === task) tails.delete(owner); }).catch(() => {});
    return task;
  },
  async activeOwner(owner) {
    if (owner === undefined) return AsyncStorage.getItem("billy.ledger.active-owner");
    if (owner) await AsyncStorage.setItem("billy.ledger.active-owner", owner);
    else await AsyncStorage.removeItem("billy.ledger.active-owner");
    return owner;
  },
};
export const mobileLedger = new OfflineLedger(storage, () => Crypto.randomUUID(), (owner, input, signal) => createTransaction(input, { signal, headers: { "X-Offline-Owner": owner } }));
