import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PulseCheckinAverages {
  checkin_avg: number | null;
  checkin_count: number;
  checkout_avg: number | null;
  checkout_count: number;
}

export function usePulseCheckinAverages(enabled = true) {
  return useQuery({
    queryKey: ["pulse_checkin_averages"],
    enabled,
    queryFn: async (): Promise<PulseCheckinAverages> => {
      const { data, error } = await (supabase as any).rpc("get_pulse_checkin_averages");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        checkin_avg: row?.checkin_avg != null ? Number(row.checkin_avg) : null,
        checkin_count: Number(row?.checkin_count ?? 0),
        checkout_avg: row?.checkout_avg != null ? Number(row.checkout_avg) : null,
        checkout_count: Number(row?.checkout_count ?? 0),
      };
    },
  });
}
