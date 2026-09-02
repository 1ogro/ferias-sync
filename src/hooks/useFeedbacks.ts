import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeedbackTone = "positivo" | "construtivo" | "neutro";
export type FeedbackChannel = "slack" | "email" | "reuniao" | "outro";

export interface ScopePerson {
  id: string;
  nome: string;
  sub_time: string | null;
  cargo: string | null;
}

export interface FeedbackAttachment {
  id: string;
  storage_path: string | null;
  file_name: string;
  mime_type: string | null;
  kind?: "file" | "link";
  external_url?: string | null;
}

export interface FeedbackLinkInput {
  url: string;
  label?: string;
}

export const MAX_FEEDBACK_FILE_BYTES = 1024 * 1024;

export interface FeedbackTimelineItem {
  id: string;
  kind: "kudo" | "peer" | "external";
  occurred_at: string;
  author_label: string | null;
  title: string | null;
  content: string | null;
  tag: string | null;
  visible_to_subject: boolean;
  attachments: FeedbackAttachment[];
}

export const FEEDBACK_BUCKET = "feedback-prints";

export function useFeedbackScope() {
  return useQuery({
    queryKey: ["feedback_scope"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_people_in_my_feedback_scope");
      if (error) throw error;
      return (data || []) as ScopePerson[];
    },
  });
}

export function useFeedbackTimeline(personId?: string, period = "all", since?: string | null) {
  return useQuery({
    queryKey: ["feedback_timeline", personId, period],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_person_feedback_timeline", {
        p_person_id: personId,
        p_since: since ?? null,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ...r,
        attachments: (r.attachments || []) as FeedbackAttachment[],
      })) as FeedbackTimelineItem[];
    },
  });
}


export interface CreateExternalFeedbackInput {
  person_id: string;
  author_id: string;
  stakeholder_name: string;
  stakeholder_org?: string | null;
  channel: FeedbackChannel;
  feedback_date: string;
  tone: FeedbackTone;
  content: string;
  visible_to_subject: boolean;
  files: File[];
  links?: FeedbackLinkInput[];
}

export function useCreateExternalFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExternalFeedbackInput) => {
      const { files, links = [], ...row } = input;
      const { data, error } = await (supabase as any)
        .from("external_feedbacks")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      const feedbackId = data.id as string;

      for (const file of files) {
        if (file.size > MAX_FEEDBACK_FILE_BYTES) throw new Error(`${file.name} passa de 1 MB.`);
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${input.person_id}/${feedbackId}/${crypto.randomUUID()}-${safeName}`;
        const up = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, file, {
          contentType: file.type || undefined,
        });
        if (up.error) throw up.error;
        const { error: attErr } = await (supabase as any).from("external_feedback_attachments").insert({
          feedback_id: feedbackId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (attErr) throw attErr;
      }
      return feedbackId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback_timeline"] });
    },
  });
}

export function useDeleteExternalFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (feedbackId: string) => {
      const { error } = await (supabase as any).from("external_feedbacks").delete().eq("id", feedbackId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback_timeline"] });
    },
  });
}

export function useToggleFeedbackVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ feedbackId, visible }: { feedbackId: string; visible: boolean }) => {
      const { error } = await (supabase as any)
        .from("external_feedbacks")
        .update({ visible_to_subject: visible })
        .eq("id", feedbackId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback_timeline"] });
    },
  });
}

export async function getSignedAttachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
