import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WellbeingKind = "checkin" | "checkout";
export type WellbeingSelection = WellbeingKind | "both";

export interface WellbeingRow {
  level: "period" | "week";
  scope: "total" | "team";
  week_start: string | null;
  sub_time: string | null;
  kind: WellbeingSelection;
  avg_value: number | null;
  response_count: number;
  respondent_count: number;
  recipients_count: number;
  responded_deliveries: number;
  status: "empty" | "protected" | "available";
  protection_reason?: "insufficient_participants" | "complementary_suppression" | null;
}

export interface WellbeingReport {
  period_start: string;
  period_end: string;
  weeks: number;
  teams: string[];
  rows: WellbeingRow[];
}

export function useWellbeingTeamWeekly(opts?: { weeks?: number; subTime?: string | null }) {
  const weeks = opts?.weeks ?? 12;
  const subTime = opts?.subTime ?? null;
  return useQuery({
    queryKey: ["wellbeing_report", weeks, subTime],
    queryFn: async (): Promise<WellbeingReport> => {
      const { data, error } = await supabase.rpc("get_wellbeing_report", {
        p_weeks: weeks,
        p_sub_time: subTime,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.rows)) {
        throw new Error("Resumo de bem-estar inválido");
      }
      return data as unknown as WellbeingReport;
    },
  });
}
