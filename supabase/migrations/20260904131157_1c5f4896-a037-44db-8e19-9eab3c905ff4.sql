ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS warmup_weights jsonb NOT NULL DEFAULT '{"like": 5, "comment": 2, "dm": 1, "ai": 50}'::jsonb;