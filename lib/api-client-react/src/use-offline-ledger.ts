import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { emptyLedger, type LedgerRecord, type OfflineLedger } from "./offline-ledger";
import type { ManualDraft } from "./manual-entry";

export function useOfflineLedger(ledger: OfflineLedger, owner: string | null | undefined) {
  const [value, setValue] = useState<{ owner: string; record: LedgerRecord } | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (!owner) return;
      void ledger.read(owner).then((record) => { if (live) { setValue({ owner, record }); setStorageError(false); } }, () => { if (live) setStorageError(true); });
    };
    refresh();
    const unsubscribe = ledger.subscribe(refresh);
    return () => { live = false; unsubscribe(); };
  }, [ledger, owner]);
  return { record: value && value.owner === owner ? value.record : emptyLedger(), ready: !!owner && value?.owner === owner, storageError };
}

export function useManualDraft<T extends ManualDraft>(ledger: OfflineLedger, owner: string | null | undefined, initial: T, slot: "draft" | "debtDraft" = "draft"): [T, Dispatch<SetStateAction<T>>, { ready: boolean; error: boolean; id: string; reset: (next: T) => void; restore: (draft: { id: string; values: ManualDraft }) => void }] {
  const [state, setState] = useState<{ owner: string | null; form: T; id: string; ready: boolean }>({ owner: null, form: initial, id: "", ready: false });
  const [error, setError] = useState(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    let live = true;
    if (owner) void ledger.read(owner).then((record) => {
      if (!live) return;
      setState({ owner, form: record[slot] ? { ...initialRef.current, ...record[slot].values } as T : initialRef.current, id: record[slot]?.id ?? ledger.uuid(), ready: true });
    }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [ledger, owner, slot]);
  useEffect(() => {
    if (owner && state.owner === owner && state.ready) void ledger.saveDraft(owner, state.id, state.form, slot).then(() => setError(false), () => setError(true));
  }, [ledger, owner, state, slot]);
  const ready = !!owner && state.owner === owner && state.ready;
  const setForm: Dispatch<SetStateAction<T>> = (next) => setState((previous) => previous.owner === owner && previous.ready ? { ...previous, form: typeof next === "function" ? (next as (old: T) => T)(previous.form) : next } : previous);
  return [ready ? state.form : initial, setForm, { ready, error, id: ready ? state.id : "", reset: (next) => setState({ owner: owner ?? null, form: next, id: ledger.uuid(), ready: !!owner }), restore: (draft) => setState({ owner: owner ?? null, form: draft.values as T, id: draft.id, ready: !!owner }) }];
}
