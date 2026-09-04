import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FeedbackReminderSettings {
  id: string;
  enabled: boolean;
  cycle_days: number;
  overdue_days: number;
  nudge_after_days: number;
  max_nudges: number;
  send_hour: number;
  timezone: string;
  updated_at: string;
}

export interface FeedbackReminderCycle {
  id: string;
  cycle_start: string;
  manager_id: string;
  pending_never: number;
  pending_overdue: number;
  nudges_sent: number;
  last_sent_at: string | null;
  resolved_at: string | null;
  escalated_at: string | null;
}

export function useFeedbackReminderSettings() {
  return useQuery({
    queryKey: ["feedback_reminder_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("feedback_reminder_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as FeedbackReminderSettings | null;
    },
  });
}

export function useUpdateFeedbackReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<FeedbackReminderSettings> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("feedback_reminder_settings")
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_reminder_settings"] }),
  });
}

export function useFeedbackReminderCycles() {
  return useQuery({
    queryKey: ["feedback_reminder_cycles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("feedback_reminder_cycles")
        .select("*")
        .order("cycle_start", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as FeedbackReminderCycle[];
    },
  });
}

export function useRunFeedbackReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("feedback-collection-reminders", {
        body: { force: true, dry_run: opts?.dryRun ?? false },
      });
      if (error) throw error;
      return data as { managers?: number; sent?: string[]; dryRun?: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_reminder_cycles"] }),
  });
}
