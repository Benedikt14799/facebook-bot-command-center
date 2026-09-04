-- Trigger-Funktion: ungueltige pending-Auftraege ablehnen.
create or replace function public.validate_job_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count numeric;
  v_limit numeric;
  v_recipient_id text;
  v_profile_url text;
  v_post_url text;
  v_post_id text;
begin
  -- Nur pending-Auftraege pruefen; andere Status duerfen auch unvollstaendig bleiben.
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;

  if NEW.type = 'like_posts' then
    if NEW.group_id is null then
      raise exception 'Fuer „Beitraege liken“ muss eine Gruppe ausgewaehlt werden.';
    end if;
    v_count := (NEW.payload->>'count')::numeric;
    if v_count is null or v_count < 1 or v_count > 20 then
      raise exception 'Fuer „Beitraege liken“ muss die Anzahl der Likes zwischen 1 und 20 liegen.';
    end if;

  elsif NEW.type = 'comment_post' then
    if NEW.group_id is null then
      raise exception 'Fuer „Beitrag kommentieren“ muss eine Gruppe ausgewaehlt werden.';
    end if;
    v_post_url := NEW.payload->>'post_url';
    v_post_id := NEW.payload->>'post_id';
    if v_post_url is null and v_post_id is null then
      raise exception 'Fuer „Beitrag kommentieren“ muss post_url oder post_id angegeben werden.';
    end if;

  elsif NEW.type = 'scan_group' then
    if NEW.group_id is null then
      raise exception 'Fuer „Gruppe scannen“ muss eine Gruppe ausgewaehlt werden.';
    end if;
    if NEW.payload ? 'limit' then
      v_limit := (NEW.payload->>'limit')::numeric;
      if v_limit is null or v_limit < 1 or v_limit > 100 then
        raise exception 'Die Scan-Tiefe muss zwischen 1 und 100 liegen.';
      end if;
    end if;

  elsif NEW.type = 'dm_new_member' then
    v_recipient_id := coalesce(NEW.recipient_id::text, NEW.payload->>'recipient_id');
    v_profile_url := NEW.payload->>'profile_url';
    if v_recipient_id is null and v_profile_url is null then
      raise exception 'Fuer „Neues Gruppenmitglied anschreiben“ muss eine Person (recipient_id oder profile_url) angegeben werden.';
    end if;

  elsif NEW.type in ('reply_message', 'follow_up') then
    v_recipient_id := coalesce(NEW.recipient_id::text, NEW.payload->>'recipient_id');
    if v_recipient_id is null then
      raise exception 'Fuer „%“ muss eine Person (recipient_id) angegeben werden.', NEW.type;
    end if;
  end if;

  return NEW;
end;
$$;

-- Trigger vor jedem INSERT/UPDATE auf jobs
drop trigger if exists jobs_validate_payload on public.jobs;
create trigger jobs_validate_payload
  before insert or update on public.jobs
  for each row
  execute function public.validate_job_payload();