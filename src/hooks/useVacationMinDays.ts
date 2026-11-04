import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const VACATION_MIN_DAYS_KEY = "vacation_min_days";

/** Returns true when a vacation of `days` violates the configured minimum (0 = no limit). */
export const isBelowVacationMinimum = (days: number, minDays: number) =>
  minDays > 0 && days > 0 && days < minDays;

export const useVacationMinDays = () => {
  const [minDays, setMinDays] = useState(0);
  useEffect(() => {
    (supabase as any)
      .from("system_settings")
      .select("value")
      .eq("key", VACATION_MIN_DAYS_KEY)
      .maybeSingle()
      .then(({ data }: any) => setMinDays(Number(data?.value) || 0));
  }, []);
  return minDays;
};
