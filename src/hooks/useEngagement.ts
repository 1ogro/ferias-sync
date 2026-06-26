import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type KudosCategory = "teamwork" | "innovation" | "delivery" | "leadership" | "customer";

export interface Kudo {
  id: string;
  from_person_id: string | null;
  to_person_id: string | null;
  message: string;
  category: KudosCategory;
  slack_channel_posted: string | null;
  created_at: string;
  from_slack_name?: string | null;
  to_slack_name?: string | null;
  pending_from?: boolean;
  pending_to?: boolean;
  from?: { nome: string } | null;
  to?: { nome: string } | null;
}

export interface LeaderboardRow {
  person_id: string;
  nome: string;
  sub_time: string | null;
  total_points: number;
}

export interface EngagementPoint {
  id: string;
  person_id: string;
  points: number;
  reason: string;
  source_id: string | null;
  created_at: string;
}

export function useKudosFeed(limit = 50) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("kudos-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kudos" }, () => {
        qc.invalidateQueries({ queryKey: ["kudos_feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ["kudos_feed", limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_kudos_feed", { p_limit: limit });
      if (error) throw error;
      const rows = (data || []) as any[];
      return rows.map((r) => ({
        ...r,
        from: r.from_person_nome ? { nome: r.from_person_nome } : null,
        to: r.to_person_nome ? { nome: r.to_person_nome } : null,
      })) as unknown as Kudo[];
    },
  });
}

export function useLeaderboard(scope: "team" | "global" = "team", period: "month" | "all" = "month") {
  return useQuery({
    queryKey: ["leaderboard", scope, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_engagement_leaderboard", {
        p_scope: scope,
        p_period: period,
      });
      if (error) throw error;
      return (data || []) as LeaderboardRow[];
    },
  });
}

export function useMyPoints(personId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!personId) return;
    // engagement_points was removed from the realtime publication to avoid
    // broadcasting teammates' points; piggy-back on kudos inserts instead.
    const ch = supabase
      .channel(`my-points-${personId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kudos", filter: `to_person_id=eq.${personId}` },
        () => qc.invalidateQueries({ queryKey: ["my_points", personId] })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kudos", filter: `from_person_id=eq.${personId}` },
        () => qc.invalidateQueries({ queryKey: ["my_points", personId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [personId, qc]);

  return useQuery({
    queryKey: ["my_points", personId],
    enabled: !!personId,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("engagement_points")
        .select("*")
        .eq("person_id", personId!)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      const points = (data || []) as EngagementPoint[];
      const total = points.reduce((acc, p) => acc + p.points, 0);
      return { total, points };
    },
  });
}

export function useSendKudo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { to_person_id: string; message: string; category: KudosCategory; post_to_channel?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("kudos-send", { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kudos_feed"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export interface EngagementPrefs {
  quiet_hours_start: string;
  quiet_hours_end: string;
  preferred_window_start: string;
  preferred_window_end: string;
  timezone: string;
}

export function useEngagementPrefs(personId?: string) {
  return useQuery({
    queryKey: ["engagement_prefs", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("quiet_hours_start, quiet_hours_end, preferred_window_start, preferred_window_end, timezone")
        .eq("person_id", personId!)
        .maybeSingle();
      if (error) throw error;
      return (data || {
        quiet_hours_start: "12:00:00",
        quiet_hours_end: "14:00:00",
        preferred_window_start: "10:00:00",
        preferred_window_end: "11:00:00",
        timezone: "America/Sao_Paulo",
      }) as EngagementPrefs;
    },
  });
}

export function useSaveEngagementPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { person_id: string } & Partial<EngagementPrefs>) => {
      const { person_id, ...rest } = input;
      const { data: existing } = await supabase
        .from("notification_preferences")
        .select("id")
        .eq("person_id", person_id)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("notification_preferences").update(rest).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_preferences").insert({ person_id, ...rest });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["engagement_prefs", vars.person_id] });
    },
  });
}

export function useActivePeople() {
  return useQuery({
    queryKey: ["active_people_simple"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, nome, sub_time")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; sub_time: string | null }[];
    },
  });
}
