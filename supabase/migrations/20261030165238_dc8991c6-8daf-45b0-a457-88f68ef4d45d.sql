ALTER TABLE public.peer_review_pairs DROP CONSTRAINT IF EXISTS peer_review_pairs_check;
ALTER TABLE public.peer_review_pairs ADD CONSTRAINT peer_review_pairs_check
  CHECK (reviewer_id <> subject_id OR dimension = 'self');