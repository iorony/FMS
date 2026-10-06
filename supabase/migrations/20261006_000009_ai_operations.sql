-- Cola persistente: subir una fotografía nunca queda bloqueado esperando a la IA.
alter table public.evidences
  add column if not exists ai_prompt_version text,
  add column if not exists ai_requested_at timestamptz,
  add column if not exists ai_completed_at timestamptz;

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('classify_evidence')),
  evidence_id uuid not null unique references public.evidences(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  scheduled_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.ai_jobs enable row level security;
create index if not exists ai_jobs_pending_idx on public.ai_jobs(status, scheduled_at);
create policy "managers read ai jobs" on public.ai_jobs for select to authenticated using (public.is_manager());

create or replace function public.queue_evidence_classification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_jobs(job_type, evidence_id)
  values ('classify_evidence', new.id)
  on conflict (evidence_id) do nothing;
  update public.evidences set ai_requested_at = now() where id = new.id;
  return new;
end;
$$;
drop trigger if exists evidence_classification_queue on public.evidences;
create trigger evidence_classification_queue
after insert on public.evidences for each row execute function public.queue_evidence_classification();

create table if not exists public.work_order_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  summary text not null check (char_length(summary) <= 3000),
  alerts jsonb not null default '[]'::jsonb,
  model_version text not null,
  prompt_version text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.work_order_ai_summaries enable row level security;
grant select, insert on public.work_order_ai_summaries to authenticated;
create policy "managers read ai summaries" on public.work_order_ai_summaries for select to authenticated using (public.is_manager());
create policy "managers create ai summaries" on public.work_order_ai_summaries for insert to authenticated with check (public.is_manager() and created_by = auth.uid());
