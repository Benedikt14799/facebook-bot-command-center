-- =============================================================
-- Phase 1 + 2: Worker-Schluessel als Hash, kanonische Auftragszustaende
-- =============================================================

-- ---------- Worker-Tokens (gehasht, mehrere je Worker moeglich) ----------
CREATE TABLE IF NOT EXISTS public.worker_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL DEFAULT '',
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

GRANT SELECT (id, worker_id, user_id, token_prefix, label, created_at, last_used_at, revoked_at)
  ON public.worker_tokens TO authenticated;
GRANT ALL ON public.worker_tokens TO service_role;

ALTER TABLE public.worker_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_tokens_own_read" ON public.worker_tokens;
CREATE POLICY "worker_tokens_own_read" ON public.worker_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS worker_tokens_worker_idx ON public.worker_tokens(worker_id);
CREATE INDEX IF NOT EXISTS worker_tokens_prefix_idx ON public.worker_tokens(token_prefix);

-- Bestehende Klartext-Tokens uebernehmen, damit niemand ausgesperrt wird.
INSERT INTO public.worker_tokens (worker_id, user_id, token_hash, token_prefix, label)
SELECT w.id, w.user_id, encode(sha256(convert_to(w.token, 'utf8')), 'hex'), left(w.token, 6), 'Übernommen'
FROM public.workers w
WHERE w.token IS NOT NULL AND w.token <> ''
ON CONFLICT (token_hash) DO NOTHING;

-- ---------- Worker-Felder ----------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'dry_run',
  ADD COLUMN IF NOT EXISTS last_ip text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS workers_updated ON public.workers;
CREATE TRIGGER workers_updated BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Klartext-Token entfernen (Hash-Kopie liegt in worker_tokens).
ALTER TABLE public.workers DROP COLUMN IF EXISTS token;

-- ---------- Zuordnung Worker <-> Bot ----------
CREATE TABLE IF NOT EXISTS public.worker_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, bot_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_bots TO authenticated;
GRANT ALL ON public.worker_bots TO service_role;
ALTER TABLE public.worker_bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker_bots_own" ON public.worker_bots;
CREATE POLICY "worker_bots_own" ON public.worker_bots
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- Auftragsfelder ----------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS executor_version text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS error_retryable boolean,
  ADD COLUMN IF NOT EXISTS error_stage text,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS test_run_id text;

ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS test_run_id text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS test_run_id text;
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS test_run_id text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS test_run_id text;

-- Altbestand auf kanonische Zustaende bringen.
UPDATE public.jobs SET status = 'running' WHERE status = 'claimed';
UPDATE public.jobs SET status = 'failed'
  WHERE status NOT IN ('pending','running','done','failed','skipped','cancelled');

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending','running','done','failed','skipped','cancelled'));

-- Verschluesselte Sitzungsdaten.
ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS cookies_enc text,
  ADD COLUMN IF NOT EXISTS enc_key_id text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.bot_secrets
  ADD COLUMN IF NOT EXISTS proxy_password_enc text,
  ADD COLUMN IF NOT EXISTS antidetect_key_enc text,
  ADD COLUMN IF NOT EXISTS enc_key_id text;

-- ---------- Indizes ----------
CREATE INDEX IF NOT EXISTS jobs_retried_from_idx ON public.jobs(retried_from_job_id);
CREATE INDEX IF NOT EXISTS jobs_due_idx ON public.jobs(user_id, scheduled_for)
  WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS jobs_single_active_retry_idx
  ON public.jobs(retried_from_job_id)
  WHERE retried_from_job_id IS NOT NULL AND status IN ('pending','running');
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_idx
  ON public.messages(user_id, external_id)
  WHERE external_id IS NOT NULL;

-- ---------- Zustandswechsel schuetzen ----------
CREATE OR REPLACE FUNCTION public.enforce_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal text[] := ARRAY['done','failed','skipped','cancelled'];
BEGIN
  IF OLD.status = NEW.status THEN
    -- Inhalte terminaler Auftraege bleiben unveraenderlich.
    IF OLD.status = ANY(terminal) THEN
      NEW.result := OLD.result;
      NEW.error := OLD.error;
      NEW.error_code := OLD.error_code;
      NEW.error_message := OLD.error_message;
      NEW.finished_at := OLD.finished_at;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = ANY(terminal) THEN
    RAISE EXCEPTION 'Abgeschlossene Auftraege koennen nicht mehr geaendert werden (% -> %).', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'pending' AND NEW.status NOT IN ('running','cancelled','failed') THEN
    RAISE EXCEPTION 'Unerlaubter Statuswechsel % -> %.', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'running' AND NEW.status NOT IN ('done','failed','skipped','cancelled') THEN
    RAISE EXCEPTION 'Unerlaubter Statuswechsel % -> %.', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_enforce_transition ON public.jobs;
CREATE TRIGGER jobs_enforce_transition BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_job_transition();

-- ---------- Konkurenzsicheres Abholen ----------
CREATE OR REPLACE FUNCTION public.claim_jobs(
  p_user_id uuid,
  p_worker_id uuid,
  p_bot_ids uuid[],
  p_types text[],
  p_limit integer
)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.jobs j
    JOIN public.bots b ON b.id = j.bot_id
    WHERE j.user_id = p_user_id
      AND j.status = 'pending'
      AND j.needs_approval = false
      AND j.scheduled_for <= now()
      AND j.attempts < j.max_attempts
      AND b.user_id = p_user_id
      AND b.manual_mode = false
      AND b.paused = false
      AND b.session_status NOT IN ('needs_login','checkpoint','captcha','expired','revoked')
      AND (p_bot_ids IS NULL OR array_length(p_bot_ids, 1) IS NULL OR j.bot_id = ANY(p_bot_ids))
      AND (p_types IS NULL OR array_length(p_types, 1) IS NULL OR j.type = ANY(p_types))
      AND (j.group_id IS NULL OR EXISTS (
            SELECT 1 FROM public.groups g WHERE g.id = j.group_id AND g.user_id = p_user_id))
    ORDER BY j.scheduled_for ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE public.jobs t
  SET status = 'running',
      claimed_at = now(),
      claimed_by = p_worker_id,
      started_at = now(),
      attempts = t.attempts + 1
  FROM candidates c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(uuid, uuid, uuid[], text[], integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(uuid, uuid, uuid[], text[], integer) TO service_role;

-- ---------- Strengere Payload-Pruefung, ohne follow_up ----------
CREATE OR REPLACE FUNCTION public.validate_job_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count numeric;
  v_limit numeric;
  v_recipient_id text;
  v_profile_url text;
  v_post_url text;
  v_post_id text;
  v_text text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN ('like_posts','comment_post','scan_group','dm_new_member','reply_message') THEN
    RAISE EXCEPTION 'Unbekannter Auftragstyp: %.', NEW.type;
  END IF;

  IF NEW.type = 'like_posts' THEN
    IF NEW.group_id IS NULL THEN
      RAISE EXCEPTION 'Fuer "Beitraege liken" muss eine Gruppe ausgewaehlt werden.';
    END IF;
    IF jsonb_typeof(NEW.payload->'count') <> 'number' THEN
      RAISE EXCEPTION 'Die Anzahl der Likes muss eine ganze Zahl zwischen 1 und 20 sein.';
    END IF;
    v_count := (NEW.payload->>'count')::numeric;
    IF v_count IS NULL OR v_count <> trunc(v_count) OR v_count < 1 OR v_count > 20 THEN
      RAISE EXCEPTION 'Die Anzahl der Likes muss eine ganze Zahl zwischen 1 und 20 sein.';
    END IF;

  ELSIF NEW.type = 'comment_post' THEN
    IF NEW.group_id IS NULL THEN
      RAISE EXCEPTION 'Fuer "Beitrag kommentieren" muss eine Gruppe ausgewaehlt werden.';
    END IF;
    v_post_url := NEW.payload->>'post_url';
    v_post_id := NEW.payload->>'post_id';
    IF v_post_url IS NULL AND v_post_id IS NULL THEN
      RAISE EXCEPTION 'Fuer "Beitrag kommentieren" muss post_url oder post_id angegeben werden.';
    END IF;
    v_text := coalesce(NEW.payload->>'text', NEW.generated_text);
    IF v_text IS NULL OR length(btrim(v_text)) = 0 THEN
      RAISE EXCEPTION 'Fuer "Beitrag kommentieren" wird ein Text benoetigt.';
    END IF;
    IF length(v_text) > 2000 THEN
      RAISE EXCEPTION 'Der Kommentartext darf hoechstens 2000 Zeichen lang sein.';
    END IF;

  ELSIF NEW.type = 'scan_group' THEN
    IF NEW.group_id IS NULL THEN
      RAISE EXCEPTION 'Fuer "Gruppe scannen" muss eine Gruppe ausgewaehlt werden.';
    END IF;
    IF NEW.payload ? 'limit' THEN
      IF jsonb_typeof(NEW.payload->'limit') <> 'number' THEN
        RAISE EXCEPTION 'Die Scan-Tiefe muss eine ganze Zahl zwischen 1 und 100 sein.';
      END IF;
      v_limit := (NEW.payload->>'limit')::numeric;
      IF v_limit IS NULL OR v_limit <> trunc(v_limit) OR v_limit < 1 OR v_limit > 100 THEN
        RAISE EXCEPTION 'Die Scan-Tiefe muss eine ganze Zahl zwischen 1 und 100 sein.';
      END IF;
    END IF;

  ELSIF NEW.type = 'dm_new_member' THEN
    v_recipient_id := coalesce(NEW.recipient_id::text, NEW.payload->>'recipient_id');
    v_profile_url := NEW.payload->>'profile_url';
    IF v_recipient_id IS NULL AND v_profile_url IS NULL THEN
      RAISE EXCEPTION 'Fuer "Neues Gruppenmitglied anschreiben" muss eine Person angegeben werden.';
    END IF;
    v_text := coalesce(NEW.payload->>'text', NEW.generated_text);
    IF v_text IS NULL OR length(btrim(v_text)) = 0 THEN
      RAISE EXCEPTION 'Fuer "Neues Gruppenmitglied anschreiben" wird ein Text benoetigt.';
    END IF;
    IF length(v_text) > 2000 THEN
      RAISE EXCEPTION 'Der Nachrichtentext darf hoechstens 2000 Zeichen lang sein.';
    END IF;

  ELSIF NEW.type = 'reply_message' THEN
    v_recipient_id := coalesce(NEW.recipient_id::text, NEW.payload->>'recipient_id');
    IF v_recipient_id IS NULL THEN
      RAISE EXCEPTION 'Fuer "Auf Nachricht antworten" muss eine Person angegeben werden.';
    END IF;
    v_text := coalesce(NEW.payload->>'text', NEW.generated_text);
    IF v_text IS NULL OR length(btrim(v_text)) = 0 THEN
      RAISE EXCEPTION 'Fuer "Auf Nachricht antworten" wird ein Text benoetigt.';
    END IF;
    IF length(v_text) > 2000 THEN
      RAISE EXCEPTION 'Der Nachrichtentext darf hoechstens 2000 Zeichen lang sein.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;