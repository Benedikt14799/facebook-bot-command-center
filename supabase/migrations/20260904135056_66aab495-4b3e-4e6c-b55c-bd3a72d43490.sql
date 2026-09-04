ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS name_source text;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS typo_rate numeric NOT NULL DEFAULT 0.12;