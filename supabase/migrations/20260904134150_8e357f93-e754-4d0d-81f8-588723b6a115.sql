ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS proxy_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proxy_protocol text NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS proxy_host text,
  ADD COLUMN IF NOT EXISTS proxy_port integer,
  ADD COLUMN IF NOT EXISTS proxy_user text,
  ADD COLUMN IF NOT EXISTS proxy_country text,
  ADD COLUMN IF NOT EXISTS proxy_rotate_url text,
  ADD COLUMN IF NOT EXISTS proxy_check jsonb,
  ADD COLUMN IF NOT EXISTS proxy_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fingerprint jsonb,
  ADD COLUMN IF NOT EXISTS behavior jsonb,
  ADD COLUMN IF NOT EXISTS browser_mode text NOT NULL DEFAULT 'stealth',
  ADD COLUMN IF NOT EXISTS antidetect jsonb;

CREATE TABLE IF NOT EXISTS public.bot_secrets (
  bot_id uuid PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proxy_password text,
  antidetect_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, UPDATE, DELETE ON public.bot_secrets TO authenticated;
GRANT ALL ON public.bot_secrets TO service_role;

ALTER TABLE public.bot_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own bot secrets write" ON public.bot_secrets;
CREATE POLICY "own bot secrets write" ON public.bot_secrets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own bot secrets update" ON public.bot_secrets;
CREATE POLICY "own bot secrets update" ON public.bot_secrets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own bot secrets delete" ON public.bot_secrets;
CREATE POLICY "own bot secrets delete" ON public.bot_secrets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);