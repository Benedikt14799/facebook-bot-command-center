DROP POLICY IF EXISTS "no client access to job locks" ON public.job_locks;
CREATE POLICY "no client access to job locks" ON public.job_locks
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);