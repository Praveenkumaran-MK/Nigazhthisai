import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, LoadingState, EmptyState, StatusIndicator } from "@sbt/ui";
import type { Trip } from "@sbt/shared-types";
import { getConductorScheduledTrip } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";

export function DashboardPage() {
  const { conductor, logout } = useConductorAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!conductor) return;
    getConductorScheduledTrip(supabase, conductor.id).then(setTrip);
  }, [conductor]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{conductor?.display_name ?? "Conductor"}</h1>
          <StatusIndicator status={isOnline ? "online" : "offline"} label={isOnline ? "Connected" : "No internet connection"} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout()}>
          Sign out
        </Button>
      </header>

      {trip === undefined && <LoadingState label="Loading today's trip…" />}

      {trip === null && (
        <EmptyState title="No trip scheduled" description="You have no scheduled or active trip for today." />
      )}

      {trip && (
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {trip.status === "ACTIVE" ? "In progress" : "Scheduled"}
          </p>
          <p className="mt-1 text-sm text-slate-300">Trip #{trip.id.slice(0, 8)}</p>
          <Button className="mt-4 w-full" size="lg" onClick={() => navigate(`/trip/${trip.id}`)}>
            {trip.status === "ACTIVE" ? "Continue trip" : "Open trip"}
          </Button>
        </Card>
      )}
    </div>
  );
}
