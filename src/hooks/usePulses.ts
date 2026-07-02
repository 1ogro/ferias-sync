import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PulseFrequency = "once" | "daily" | "weekly" | "biweekly" | "monthly";
export type PulseQuestionType = "scale_1_5" | "open_text";

export interface PulseQuestion {
  id?: string;
  survey_id?: string;
  position: number;
  question_text: string;
  question_type: PulseQuestionType;
  required: boolean;
}

export interface PulseSurvey {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  anonymous: boolean;
  frequency: PulseFrequency;
  next_run_at: string | null;
  last_run_at: string | null;
  active: boolean;
  target_scope: "all" | "teams" | "custom";
  target_team_id: string | null;
  target_team_ids: string[] | null;
  target_person_ids: string[] | null;
  tone?: "formal" | "neutral" | "casual";
  kind?: "self" | "peer" | "kudos";
  peer_anonymous?: boolean;
  peer_pairing_strategy?: "round_robin" | "random" | "fixed";
  peer_fixed_pairs?: { reviewer_id: string; subject_id: string }[] | null;
  kudos_categories?: string[] | null;
  kudos_channel?: string | null;
  prompt_text?: string | null;
  notify_manager_on_negative?: boolean;
  notify_manager_on_positive?: boolean;
  notify_negative_threshold?: number;
  notify_positive_threshold?: number;
  notify_include_text_responses?: boolean;
  response_deadline_hours?: number | null;
  reminder_enabled?: boolean;
  reminder_offsets_hours?: number[];
  created_at: string;
  updated_at: string;
}

export type KudosCategory = "teamwork" | "innovation" | "delivery" | "leadership" | "customer";

export interface CreateSurveyInput {
  title: string;
  description?: string;
  anonymous: boolean;
  tone?: "formal" | "neutral" | "casual";
  kind?: "self" | "peer" | "kudos";
  peer_anonymous?: boolean;
  peer_pairing_strategy?: "round_robin" | "random" | "fixed";
  peer_fixed_pairs?: { reviewer_id: string; subject_id: string }[] | null;
  kudos_categories?: string[] | null;
  kudos_channel?: string | null;
  prompt_text?: string | null;
  frequency: PulseFrequency;
  next_run_at: string;
  target_scope: "all" | "teams" | "custom";
  target_team_id?: string | null;
  target_team_ids?: string[] | null;
  target_person_ids?: string[] | null;
  notify_manager_on_negative?: boolean;
  notify_manager_on_positive?: boolean;
  notify_negative_threshold?: number;
  notify_positive_threshold?: number;
  notify_include_text_responses?: boolean;
  response_deadline_hours?: number | null;
  reminder_enabled?: boolean;
  reminder_offsets_hours?: number[];
  questions: PulseQuestion[];
}


export function usePulseSurveys() {
  return useQuery({
    queryKey: ["pulse_surveys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pulse_surveys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as PulseSurvey[];
    },
  });
}

export function usePulseQuestions(surveyId?: string) {
  return useQuery({
    queryKey: ["pulse_questions", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pulse_questions")
        .select("*")
        .eq("survey_id", surveyId!)
        .order("position");
      if (error) throw error;
      return data as PulseQuestion[];
    },
  });
}

export function usePulseRuns(surveyId?: string) {
  return useQuery({
    queryKey: ["pulse_runs", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pulse_runs")
        .select("*")
        .eq("survey_id", surveyId!)
        .order("dispatched_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePulseResponses(surveyId?: string) {
  return useQuery({
    queryKey: ["pulse_responses_safe", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_pulse_responses_safe", {
        p_survey_id: surveyId!,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreatePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSurveyInput & { created_by: string }) => {
      const { questions, ...survey } = input;
      const kind = survey.kind ?? "self";
      const { data: createdSurvey, error } = await supabase
        .from("pulse_surveys")
        .insert({
          created_by: survey.created_by,
          title: survey.title,
          description: survey.description ?? null,
          anonymous: survey.anonymous,
          tone: survey.tone ?? "neutral",
          kind,
          peer_anonymous: survey.peer_anonymous ?? true,
          peer_pairing_strategy: kind === "peer" ? (survey.peer_pairing_strategy ?? "round_robin") : "round_robin",
          peer_fixed_pairs: kind === "peer" ? (survey.peer_fixed_pairs ?? null) : null,
          kudos_categories: kind === "kudos" ? (survey.kudos_categories ?? null) : null,
          kudos_channel: kind === "kudos" ? (survey.kudos_channel ?? null) : null,
          prompt_text: kind === "kudos" ? (survey.prompt_text ?? null) : null,
          frequency: survey.frequency,
          next_run_at: survey.next_run_at,
          target_scope: survey.target_scope,
          target_team_id: survey.target_team_id ?? null,
          target_team_ids: survey.target_team_ids ?? null,
          target_person_ids: survey.target_person_ids ?? null,
          notify_manager_on_negative: survey.notify_manager_on_negative ?? false,
          notify_manager_on_positive: survey.notify_manager_on_positive ?? false,
          notify_negative_threshold: survey.notify_negative_threshold ?? 2,
          notify_positive_threshold: survey.notify_positive_threshold ?? 4,
          notify_include_text_responses: survey.notify_include_text_responses ?? false,
          response_deadline_hours: survey.response_deadline_hours ?? null,
          reminder_enabled: survey.reminder_enabled ?? true,
          reminder_offsets_hours: survey.reminder_offsets_hours ?? [24, 2],
          active: true,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (kind !== "kudos" && questions.length) {
        const { error: qErr } = await supabase.from("pulse_questions").insert(
          questions.map((q, i) => ({
            survey_id: createdSurvey.id,
            position: i,
            question_text: q.question_text,
            question_type: q.question_type,
            required: q.required,
          }))
        );
        if (qErr) throw qErr;
      }
      return createdSurvey;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse_surveys"] }),
  });
}

export function useTogglePulseActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("pulse_surveys").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse_surveys"] }),
  });
}

export interface UpdateSurveyInput {
  id: string;
  title: string;
  description?: string | null;
  anonymous: boolean;
  tone?: "formal" | "neutral" | "casual";
  kind?: "self" | "peer" | "kudos";
  peer_anonymous?: boolean;
  peer_pairing_strategy?: "round_robin" | "random" | "fixed";
  peer_fixed_pairs?: { reviewer_id: string; subject_id: string }[] | null;
  kudos_categories?: string[] | null;
  kudos_channel?: string | null;
  prompt_text?: string | null;
  frequency: PulseFrequency;
  next_run_at: string;
  target_scope: "all" | "teams" | "custom";
  target_team_id?: string | null;
  target_team_ids?: string[] | null;
  target_person_ids?: string[] | null;
  notify_manager_on_negative?: boolean;
  notify_manager_on_positive?: boolean;
  notify_negative_threshold?: number;
  notify_positive_threshold?: number;
  notify_include_text_responses?: boolean;
  questions?: PulseQuestion[]; // if provided, replaces all questions (ignored for kudos)
}

export function useUpdatePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSurveyInput) => {
      const { id, questions, ...fields } = input;
      const kind = fields.kind ?? "self";
      const { error } = await supabase
        .from("pulse_surveys")
        .update({
          title: fields.title,
          description: fields.description ?? null,
          anonymous: fields.anonymous,
          tone: fields.tone ?? "neutral",
          kind,
          peer_anonymous: fields.peer_anonymous ?? true,
          peer_pairing_strategy: kind === "peer" ? (fields.peer_pairing_strategy ?? "round_robin") : "round_robin",
          peer_fixed_pairs: kind === "peer" ? (fields.peer_fixed_pairs ?? null) : null,
          kudos_categories: kind === "kudos" ? (fields.kudos_categories ?? null) : null,
          kudos_channel: kind === "kudos" ? (fields.kudos_channel ?? null) : null,
          prompt_text: kind === "kudos" ? (fields.prompt_text ?? null) : null,
          frequency: fields.frequency,
          next_run_at: fields.next_run_at,
          target_scope: fields.target_scope,
          target_team_id: fields.target_team_id ?? null,
          target_team_ids: fields.target_team_ids ?? null,
          target_person_ids: fields.target_person_ids ?? null,
          notify_manager_on_negative: fields.notify_manager_on_negative ?? false,
          notify_manager_on_positive: fields.notify_manager_on_positive ?? false,
          notify_negative_threshold: fields.notify_negative_threshold ?? 2,
          notify_positive_threshold: fields.notify_positive_threshold ?? 4,
          notify_include_text_responses: fields.notify_include_text_responses ?? false,
        } as any)
        .eq("id", id);
      if (error) throw error;

      if (kind !== "kudos" && questions) {
        const { error: delErr } = await supabase.from("pulse_questions").delete().eq("survey_id", id);
        if (delErr) throw delErr;
        if (questions.length) {
          const { error: insErr } = await supabase.from("pulse_questions").insert(
            questions.map((q, i) => ({
              survey_id: id,
              position: i,
              question_text: q.question_text,
              question_type: q.question_type,
              required: q.required,
            }))
          );
          if (insErr) throw insErr;
        }
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["pulse_surveys"] });
      qc.invalidateQueries({ queryKey: ["pulse_questions", id] });
    },
  });
}


export function useDeletePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pulse_surveys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse_surveys"] }),
  });
}

export function useDuplicatePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ surveyId, createdBy }: { surveyId: string; createdBy: string }) => {
      const { data: orig, error: e1 } = await supabase
        .from("pulse_surveys")
        .select("*")
        .eq("id", surveyId)
        .single();
      if (e1) throw e1;

      const { data: qs, error: e2 } = await supabase
        .from("pulse_questions")
        .select("*")
        .eq("survey_id", surveyId)
        .order("position");
      if (e2) throw e2;

      const nextRun = new Date(Date.now() + 30 * 60_000).toISOString();
      const { data: newSurvey, error: e3 } = await supabase
        .from("pulse_surveys")
        .insert({
          created_by: createdBy,
          title: `${orig.title} (cópia)`,
          description: orig.description,
          anonymous: orig.anonymous,
          tone: (orig as any).tone ?? "neutral",
          kind: (orig as any).kind ?? "self",
          peer_anonymous: (orig as any).peer_anonymous ?? true,
          peer_pairing_strategy: (orig as any).peer_pairing_strategy ?? "round_robin",
          peer_fixed_pairs: (orig as any).peer_fixed_pairs ?? null,
          kudos_categories: (orig as any).kudos_categories ?? null,
          kudos_channel: (orig as any).kudos_channel ?? null,
          prompt_text: (orig as any).prompt_text ?? null,
          frequency: orig.frequency,
          next_run_at: nextRun,
          target_scope: orig.target_scope,
          target_team_id: orig.target_team_id,
          target_team_ids: (orig as any).target_team_ids ?? null,
          target_person_ids: orig.target_person_ids,
          active: false,
        } as any)
        .select()
        .single();
      if (e3) throw e3;

      if (qs && qs.length) {
        const { error: e4 } = await supabase.from("pulse_questions").insert(
          qs.map((q, i) => ({
            survey_id: newSurvey.id,
            position: i,
            question_text: q.question_text,
            question_type: q.question_type,
            required: q.required,
          }))
        );
        if (e4) throw e4;
      }
      return newSurvey;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse_surveys"] }),
  });
}


export async function dispatchPulseNow(surveyId: string) {
  const { data, error } = await supabase.functions.invoke("pulse-dispatch", {
    body: { surveyId },
  });
  if (error) throw error;
  return data;
}

export async function downloadPulseExport(surveyId: string, format: "csv" | "xlsx") {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-export?survey_id=${surveyId}&format=${format}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pulse_${surveyId}.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}
