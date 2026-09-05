ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS live_enabled boolean NOT NULL DEFAULT false;

-- Idempotenz der Nebenwirkungen: pro Auftrag/Richtung/Text nur ein Datensatz.
CREATE UNIQUE INDEX IF NOT EXISTS messages_job_unique
  ON public.messages (user_id, job_id, direction, md5(body))
  WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_events_job_unique
  ON public.contact_events (user_id, recipient_id, job_id, kind, direction)
  WHERE job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_jobs(p_user_id uuid, p_worker_id uuid, p_bot_ids uuid[], p_types text[], p_limit integer)
 RETURNS SETOF jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  -- Der Worker muss existieren, dem Benutzer gehoeren, nicht widerrufen sein
  -- und ein frisches Lebenszeichen (<= 90 Sekunden) haben.
  SELECT true INTO v_ok
  FROM public.workers w
  WHERE w.id = p_worker_id
    AND w.user_id = p_user_id
    AND w.revoked_at IS NULL
    AND w.last_seen_at IS NOT NULL
    AND w.last_seen_at > now() - interval '90 seconds';

  IF v_ok IS NOT TRUE THEN
    RETURN;
  END IF;

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
      -- Arbeitszeitfenster des Bots in seiner Zeitzone.
      AND (
        CASE
          WHEN b.active_from = b.active_to THEN true
          WHEN b.active_from < b.active_to THEN
            (now() AT TIME ZONE b.timezone)::time BETWEEN b.active_from AND b.active_to
          ELSE
            (now() AT TIME ZONE b.timezone)::time >= b.active_from
            OR (now() AT TIME ZONE b.timezone)::time <= b.active_to
        END
      )
      -- Der Bot muss diesem Worker ausdruecklich zugeordnet sein.
      AND EXISTS (
        SELECT 1 FROM public.worker_bots wb
        WHERE wb.worker_id = p_worker_id AND wb.bot_id = j.bot_id AND wb.user_id = p_user_id
      )
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
$function$;