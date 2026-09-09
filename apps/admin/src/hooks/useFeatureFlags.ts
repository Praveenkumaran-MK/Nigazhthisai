import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "./useAdminAuth";

export interface FeatureFlag {
  feature_key: string;
  display_name: string;
  description: string | null;
  is_enabled: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

export function useFeatureFlags() {
  const { profile } = useAdminAuth();
  const isMasterAdmin = profile?.role === "master_admin";
  const [flags, setFlags] = useState<Record<string, boolean>>({
    dashboard: true,
    live_monitoring: true,
    revenue_analytics: true,
    operations_module: true,
    buses_management: true,
    routes_management: true,
    trips_management: true,
    operational_alerts: true,
    shops_management: true,
    support_faq: true,
  });
  const [featureList, setFeatureList] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("system_feature_flags")
        .select("*")
        .order("feature_key", { ascending: true });

      if (!error && data) {
        setFeatureList(data as FeatureFlag[]);
        const map: Record<string, boolean> = {};
        data.forEach((item: FeatureFlag) => {
          map[item.feature_key] = item.is_enabled;
        });
        setFlags((prev) => ({ ...prev, ...map }));
      }
    } catch (err) {
      console.error("Failed to fetch feature flags:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFlags();

    // Subscribe to realtime database changes for instantaneous sync
    const channel = supabase
      .channel("realtime-feature-flags")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "system_feature_flags",
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object" && "feature_key" in payload.new) {
            const updated = payload.new as FeatureFlag;
            setFlags((prev) => ({
              ...prev,
              [updated.feature_key]: updated.is_enabled,
            }));
            setFeatureList((prevList) => {
              const idx = prevList.findIndex((f) => f.feature_key === updated.feature_key);
              if (idx >= 0) {
                const next = [...prevList];
                next[idx] = updated;
                return next;
              }
              return [...prevList, updated];
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchFlags]);

  const toggleFlag = async (featureKey: string, nextState: boolean) => {
    // Master admin only check
    if (!isMasterAdmin) {
      throw new Error("Only Master Admin has authority to toggle system feature flags.");
    }

    setUpdatingKey(featureKey);
    const prevState = flags[featureKey] ?? true;

    // Optimistic update
    setFlags((prev) => ({ ...prev, [featureKey]: nextState }));
    setFeatureList((prev) =>
      prev.map((f) => (f.feature_key === featureKey ? { ...f, is_enabled: nextState } : f))
    );

    try {
      const { error } = await supabase.rpc("toggle_feature_flag", {
        p_feature_key: featureKey,
        p_is_enabled: nextState,
      });

      if (error) {
        // Rollback on failure
        setFlags((prev) => ({ ...prev, [featureKey]: prevState }));
        setFeatureList((prev) =>
          prev.map((f) => (f.feature_key === featureKey ? { ...f, is_enabled: prevState } : f))
        );
        throw error;
      }
    } catch (err) {
      console.error(`Error toggling feature flag ${featureKey}:`, err);
      throw err;
    } finally {
      setUpdatingKey(null);
    }
  };

  /**
   * Evaluates whether a normal admin is allowed to access the specified module.
   * Master Admin always has full access regardless of flag toggle.
   */
  const isAccessible = useCallback(
    (featureKey?: string) => {
      if (!featureKey) return true;
      if (isMasterAdmin) return true;
      return flags[featureKey] ?? true;
    },
    [flags, isMasterAdmin]
  );

  return {
    flags,
    featureList,
    loading,
    updatingKey,
    toggleFlag,
    isAccessible,
    refetch: fetchFlags,
  };
}
