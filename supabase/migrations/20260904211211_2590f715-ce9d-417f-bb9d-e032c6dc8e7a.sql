ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS retried_from_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_retried_from_job_id_idx
  ON public.jobs (retried_from_job_id);