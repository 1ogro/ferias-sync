import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PulseAveragesWindow {
  checkin_avg: number | null;
  checkin_count: number;
  checkout_avg: number | null;
  checkout_count: number;
}

export interface PulseWeekWindow extends PulseAveragesWindow {
  checkin_week_start: string | null;
  checkout_week_start: string | null;
}

export interface PulseCheckinAverages {
  week: PulseWeekWindow;
  month: PulseAveragesWindow;
  // Back-compat flat fields (30d)
  checkin_avg: number | null;
  checkin_count: number;
  checkout_avg: number | null;
  checkout_count: number;
}

function num(v: any): number | null {
  return v != null ? Number(v) : null;
}

export function usePulseCheckinAverages(enabled = true) {
  return useQuery({
    queryKey: ["pulse_checkin_averages_v2"],
    enabled,
    queryFn: async (): Promise<PulseCheckinAverages> => {
      const { data, error } = await (supabase as any).rpc("get_pulse_checkin_averages_v2");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const week: PulseWeekWindow = {
        checkin_avg: num(row?.week_checkin_avg),
        checkin_count: Number(row?.week_checkin_count ?? 0),
        checkin_week_start: row?.week_checkin_start ?? null,
        checkout_avg: num(row?.week_checkout_avg),
        checkout_count: Number(row?.week_checkout_count ?? 0),
        checkout_week_start: row?.week_checkout_start ?? null,
      };
      const month: PulseAveragesWindow = {
        checkin_avg: num(row?.month_checkin_avg),
        checkin_count: Number(row?.month_checkin_count ?? 0),
        checkout_avg: num(row?.month_checkout_avg),
        checkout_count: Number(row?.month_checkout_count ?? 0),
      };
      return {
        week,
        month,
        checkin_avg: month.checkin_avg,
        checkin_count: month.checkin_count,
        checkout_avg: month.checkout_avg,
        checkout_count: month.checkout_count,
      };
    },
  });
}
