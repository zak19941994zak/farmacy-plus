ALTER TABLE public.activity_logs
ADD COLUMN IF NOT EXISTS entity_id uuid;