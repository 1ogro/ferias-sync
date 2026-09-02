import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReportScope = "team" | "global";

export interface MonthlyReportRow {
  person_id: string;
  nome: string;
  sub_time: string | null;
  kudos_received: number;
  kudos_given: number;
  peer_feedbacks: number;
  external_feedbacks: number;
  total: number;
  last_activity_at: string | null;
}

export interface MonthlyContributor {
  author_id: string | null;
  author_name: string;
  feedbacks: number;
  last_at: string | null;
}

/** month: "YYYY-MM" */
export function monthToDate(month: string) {
  return `${month}-01`;
}

export function useMonthlyReport(month: string, scope: ReportScope) {
  return useQuery({
    queryKey: ["engagement_monthly_report", month, scope],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_engagement_monthly_report", {
        p_month: monthToDate(month),
        p_scope: scope,
      });
      if (error) throw error;
      return ((data || []) as MonthlyReportRow[]).map((r) => ({
        ...r,
        last_activity_at:
          r.last_activity_at && !String(r.last_activity_at).startsWith("-infinity")
            ? r.last_activity_at
            : null,
      }));
    },
  });
}

export function useMonthlyContributors(month: string, scope: ReportScope) {
  return useQuery({
    queryKey: ["engagement_monthly_contributors", month, scope],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_engagement_monthly_contributors", {
        p_month: monthToDate(month),
        p_scope: scope,
      });
      if (error) throw error;
      return (data || []) as MonthlyContributor[];
    },
  });
}

export interface TeamSummaryRow {
  sub_time: string;
  people_count: number;
  kudos: number;
  peer_feedbacks: number;
  external_feedbacks: number;
  total: number;
  avg_per_person: number | null;
}

export function useTeamSummary(month: string, scope: ReportScope) {
  return useQuery({
    queryKey: ["engagement_team_summary", month, scope],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_engagement_team_summary", {
        p_month: monthToDate(month),
        p_scope: scope,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ...r,
        avg_per_person: r.avg_per_person === null ? null : Number(r.avg_per_person),
      })) as TeamSummaryRow[];
    },
  });
}
