CREATE POLICY "Feedback prints readable in scope"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-prints'
  AND (
    public.can_manage_person_feedback((storage.foldername(name))[1])
    OR EXISTS (
      SELECT 1 FROM public.external_feedback_attachments a
      JOIN public.external_feedbacks f ON f.id = a.feedback_id
      WHERE a.storage_path = storage.objects.name
        AND f.visible_to_subject
        AND f.person_id = public.current_person_id()
    )
  )
);

CREATE POLICY "Feedback prints uploadable in scope"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-prints'
  AND public.can_manage_person_feedback((storage.foldername(name))[1])
);

CREATE POLICY "Feedback prints deletable in scope"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-prints'
  AND public.can_manage_person_feedback((storage.foldername(name))[1])
);