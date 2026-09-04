ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS autopilot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS simulate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_extra_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_preset text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS warmup_plan jsonb NOT NULL DEFAULT '[
    {"day":1,"likes":3,"comments":0,"dms":0},
    {"day":3,"likes":6,"comments":1,"dms":0},
    {"day":6,"likes":10,"comments":3,"dms":2},
    {"day":10,"likes":16,"comments":5,"dms":5},
    {"day":15,"likes":25,"comments":8,"dms":10}
  ]'::jsonb;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS public.automation_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_state TO authenticated;
GRANT ALL ON public.automation_state TO service_role;
ALTER TABLE public.automation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own automation state" ON public.automation_state;
CREATE POLICY "own automation state" ON public.automation_state
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS automation_state_updated ON public.automation_state;
CREATE TRIGGER automation_state_updated BEFORE UPDATE ON public.automation_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.job_locks (
  name text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  holder text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_locks TO service_role;
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;