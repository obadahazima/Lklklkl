import { useState } from "react";
import {
  useListClients,
  useListTransactions,
  useCreateClient,
  useDeleteClient,
  getListClientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Users, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings, toAedFrontend, convertToPrimary } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { cn, formatAmount } from "@/lib/utils";

export default function Clients() {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, effectiveRates } = useSettings();
  const { language, primaryCurrency } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: clients, isLoading } = useListClients();
  const { data: txs } = useListTransactions({});

  // Balance per client, converted to the primary currency (respects
  // exchange-rate mode: auto live rates or manual rates from settings).
  const balancesByClient = new Map<number, number>();
  if (txs) {
    const byClient = new Map<number, typeof txs>();
    for (const tx of txs) {
      if (tx.clientId == null) continue;
      const list = byClient.get(tx.clientId) ?? [];
      list.push(tx);
      byClient.set(tx.clientId, list);
    }
    for (const [clientId, clientTxs] of byClient) {
      const currencies = [...new Set(clientTxs.map((tx) => tx.currency))];
      let totalPrimary = 0;
      for (const currency of currencies) {
        const currTxs = clientTxs.filter((tx) => tx.currency === currency);
        const paid = currTxs
          .filter((tx) => tx.type === "expense" || tx.type === "payment")
          .reduce((s, tx) => s + tx.amount, 0);
        const received = currTxs
          .filter((tx) => tx.type === "income" || tx.type === "receipt")
          .reduce((s, tx) => s + tx.amount, 0);
        const openBalance = received - paid;
        const inAed = toAedFrontend(openBalance, currency, effectiveRates);
        totalPrimary += convertToPrimary(inAed, primaryCurrency, effectiveRates);
      }
      balancesByClient.set(clientId, Math.round(totalPrimary * 100) / 100);
    }
  }

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setShowAdd(false);
        setName(""); setPhone("");
        toast({ title: t("clientAddedTitle"), description: t("clientAddedDesc") });
      },
    },
  });

  const deleteMutation = useDeleteClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: t("deletedSuccess") });
      },
    },
  });

  const ChevronNav = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("p-4 space-y-4 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">{t("clients")}</h1>
          <p className="text-muted-foreground text-sm">{clients?.length ?? 0} {t("clientCount")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
          data-testid="btn-add-client"
        >
          <Plus className="w-4 h-4" />
          {t("newClient")}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">{t("addClientTitle")}</h2>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("clientNamePlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-client-name"
            />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phonePlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-client-phone"
            />
            <button
              onClick={() => name.trim() && createMutation.mutate({ data: { name, phone: phone || undefined } })}
              disabled={createMutation.isPending || !name.trim()}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              data-testid="btn-save-client"
            >
              {createMutation.isPending ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => <div key={i} className="p-4 animate-pulse"><div className="h-4 bg-muted rounded w-1/3" /></div>)}
          </div>
        ) : clients?.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noClients")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients?.map((client) => {
              const balance = balancesByClient.get(client.id) ?? 0;
              return (
              <div key={client.id} className="flex items-center justify-between p-4" data-testid={`client-row-${client.id}`}>
                <Link href={`/clients/${client.id}`}>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{client.name}</p>
                      {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                    </div>
                  </div>
                </Link>
                <div className="flex flex-col items-end gap-1.5">
                  {balance !== 0 && (
                    <span
                      className={cn("text-xs font-bold whitespace-nowrap", balance > 0 ? "text-green-600" : "text-red-600")}
                      data-testid={`client-balance-${client.id}`}
                    >
                      {balance > 0
                        ? (language === "ar" ? "له " : "") + formatAmount(balance, primaryCurrency)
                        : (language === "ar" ? "عليه " : "-") + formatAmount(balance, primaryCurrency)}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <Link href={`/clients/${client.id}`}>
                      <button className="text-primary text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary/10">
                        {t("statement")}
                        <ChevronNav className="w-3 h-3" />
                      </button>
                    </Link>
                    <button
                      onClick={() => window.confirm(t("deleteClientConfirm")) && deleteMutation.mutate({ id: client.id })}
                      className="text-muted-foreground hover:text-destructive p-1"
                      data-testid={`btn-delete-client-${client.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}