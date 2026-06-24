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
  target_scope: "team" | "custom";
  target_team_id: string | null;
  target_person_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSurveyInput {
  title: string;
  description?: string;
  anonymous: boolean;
  frequency: PulseFrequency;
  next_run_at: string;
  target_scope: "team" | "custom";
  target_team_id?: string | null;
  target_person_ids?: string[] | null;
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
      return data as PulseSurvey[];
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
      const { data, error } = await (supabase as any)
        .from("pulse_responses_safe")
        .select("*")
        .eq("survey_id", surveyId!)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreatePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSurveyInput & { created_by: string }) => {
      const { questions, ...survey } = input;
      const { data: createdSurvey, error } = await supabase
        .from("pulse_surveys")
        .insert({
          created_by: survey.created_by,
          title: survey.title,
          description: survey.description ?? null,
          anonymous: survey.anonymous,
          frequency: survey.frequency,
          next_run_at: survey.next_run_at,
          target_scope: survey.target_scope,
          target_team_id: survey.target_team_id ?? null,
          target_person_ids: survey.target_person_ids ?? null,
          active: true,
        })
        .select()
        .single();
      if (error) throw error;

      if (questions.length) {
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
  frequency: PulseFrequency;
  next_run_at: string;
  target_scope: "team" | "custom";
  target_team_id?: string | null;
  target_person_ids?: string[] | null;
  questions?: PulseQuestion[]; // if provided, replaces all questions
}

export function useUpdatePulseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSurveyInput) => {
      const { id, questions, ...fields } = input;
      const { error } = await supabase
        .from("pulse_surveys")
        .update({
          title: fields.title,
          description: fields.description ?? null,
          anonymous: fields.anonymous,
          frequency: fields.frequency,
          next_run_at: fields.next_run_at,
          target_scope: fields.target_scope,
          target_team_id: fields.target_team_id ?? null,
          target_person_ids: fields.target_person_ids ?? null,
        })
        .eq("id", id);
      if (error) throw error;

      if (questions) {
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
