
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS target_team_ids text[];

-- Migrate existing single-team rows into the array column
UPDATE public.pulse_surveys
   SET target_team_ids = ARRAY[target_team_id]
 WHERE target_scope = 'team'
   AND target_team_id IS NOT NULL
   AND (target_team_ids IS NULL OR array_length(target_team_ids, 1) IS NULL);

-- Rename 'team' scope to 'teams'
UPDATE public.pulse_surveys SET target_scope = 'teams' WHERE target_scope = 'team';

-- Replace check constraint
ALTER TABLE public.pulse_surveys DROP CONSTRAINT IF EXISTS pulse_surveys_target_scope_check;
ALTER TABLE public.pulse_surveys
  ADD CONSTRAINT pulse_surveys_target_scope_check
  CHECK (target_scope = ANY (ARRAY['all'::text, 'teams'::text, 'custom'::text]));
