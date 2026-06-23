import { useState } from "react";
import { useListTrips, useCreateTrip, useDeleteTrip, getListTripsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Route, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { cn, statusClass, statusLabel } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

export default function Trips() {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: trips, isLoading } = useListTrips();

  const createMutation = useCreateTrip({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
        setShowAdd(false); setName(""); setIsShared(false);
        toast({ title: t("tripAddedTitle"), description: t("tripAddedDesc") });
      },
    },
  });

  const deleteMutation = useDeleteTrip({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
        toast({ title: t("deletedSuccess") });
      },
    },
  });

  const ChevronNav = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("p-4 space-y-4 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">{t("trips")}</h1>
          <p className="text-muted-foreground text-sm">{trips?.length ?? 0} {t("tripCount")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
          data-testid="btn-add-trip"
        >
          <Plus className="w-4 h-4" />
          {t("newTrip")}
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">{t("addTripTitle")}</h2>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("tripNamePlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-trip-name"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="w-4 h-4 rounded text-primary"
                data-testid="check-trip-shared"
              />
              <span className="text-sm text-foreground">{t("sharedTripLabel")}</span>
            </label>
            <button
              onClick={() => name.trim() && createMutation.mutate({ data: { name, isShared, status: "active" } })}
              disabled={createMutation.isPending || !name.trim()}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              data-testid="btn-save-trip"
            >
              {createMutation.isPending ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => <div key={i} className="p-4 animate-pulse"><div className="h-4 bg-muted rounded w-1/2" /></div>)}
          </div>
        ) : trips?.length === 0 ? (
          <div className="p-10 text-center">
            <Route className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noTrips")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {trips?.map((trip) => (
              <div key={trip.id} className="flex items-center justify-between p-4" data-testid={`trip-row-${trip.id}`}>
                <Link href={`/trips/${trip.id}`}>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                      <Route className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground">{trip.name}</p>
                        {trip.isShared && (
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 px-1.5 py-0.5 rounded-full">{t("shared")}</span>
                        )}
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusClass(trip.status))}>
                        {statusLabel(trip.status, language)}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Link href={`/trips/${trip.id}`}>
                    <button className="text-primary text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary/10">
                      {t("profits")}
                      <ChevronNav className="w-3 h-3" />
                    </button>
                  </Link>
                  <button
                    onClick={() => window.confirm(t("deleteTripConfirm")) && deleteMutation.mutate({ id: trip.id })}
                    className="text-muted-foreground hover:text-destructive p-1"
                    data-testid={`btn-delete-trip-${trip.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
