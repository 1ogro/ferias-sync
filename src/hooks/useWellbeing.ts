import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WellbeingKind = "checkin" | "checkout";

export interface WellbeingRow {
  week_start: string;
  sub_time: string;
  kind: WellbeingKind;
  avg_value: number | null;
  response_count: number;
  respondent_count: number;
  recipients_count: number;
}

export function useWellbeingTeamWeekly(opts?: { weeks?: number; subTime?: string | null }) {
  const weeks = opts?.weeks ?? 12;
  const subTime = opts?.subTime ?? null;
  return useQuery({
    queryKey: ["wellbeing_team_weekly", weeks, subTime],
    queryFn: async (): Promise<WellbeingRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_wellbeing_team_weekly", {
        p_weeks: weeks,
        p_sub_time: subTime,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        week_start: r.week_start,
        sub_time: r.sub_time ?? "Sem time",
        kind: r.kind as WellbeingKind,
        avg_value: r.avg_value != null ? Number(r.avg_value) : null,
        response_count: Number(r.response_count ?? 0),
        respondent_count: Number(r.respondent_count ?? 0),
        recipients_count: Number(r.recipients_count ?? 0),
      }));
    },
  });
}
