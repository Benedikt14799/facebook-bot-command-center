ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_context text,
  ADD COLUMN IF NOT EXISTS context_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS generated_text text;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS persona_role text NOT NULL DEFAULT 'Aktives Gruppenmitglied',
  ADD COLUMN IF NOT EXISTS offer_text text,
  ADD COLUMN IF NOT EXISTS offer_link text,
  ADD COLUMN IF NOT EXISTS offer_step integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS public.contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.recipients(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_events TO authenticated;
GRANT ALL ON public.contact_events TO service_role;
ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contact_events" ON public.contact_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS contact_events_recipient_idx ON public.contact_events(recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lovable',
  model text NOT NULL DEFAULT 'google/gemini-3.7-flash',
  base_url text,
  api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (user_id, provider, model, base_url, created_at, updated_at) ON public.ai_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai_settings" ON public.ai_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ai_settings_updated BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();