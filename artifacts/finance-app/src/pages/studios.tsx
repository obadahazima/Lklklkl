import { useState } from "react";
import { useListStudios, useCreateStudio, getListStudiosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Building2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function Studios() {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: studios, isLoading } = useListStudios();

  const createMutation = useCreateStudio({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStudiosQueryKey() });
        setShowAdd(false); setName(""); setAddress("");
        toast({ title: t("studioAddedTitle"), description: t("studioAddedDesc") });
      },
    },
  });

  const ChevronNav = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("p-4 space-y-4 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">{t("studios")}</h1>
          <p className="text-muted-foreground text-sm">{studios?.length ?? 0} {t("studioCount")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
          data-testid="btn-add-studio"
        >
          <Plus className="w-4 h-4" />
          {t("newStudio")}
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">{t("addStudioTitle")}</h2>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("studioNamePlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-studio-name"
            />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-studio-address"
            />
            <button
              onClick={() => name.trim() && createMutation.mutate({ data: { name, address: address || undefined } })}
              disabled={createMutation.isPending || !name.trim()}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              data-testid="btn-save-studio"
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-32 bg-card rounded-2xl border border-border animate-pulse" />)
        ) : studios?.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noStudios")}</p>
          </div>
        ) : (
          studios?.map((studio) => (
            <Link href={`/studios/${studio.id}`} key={studio.id}>
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer" data-testid={`studio-card-${studio.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{studio.name}</h3>
                      {studio.address && <p className="text-xs text-muted-foreground mt-0.5">{studio.address}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-primary text-xs font-medium">
                    {t("studioExpensesLink")}
                    <ChevronNav className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
