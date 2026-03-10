-- SOHO Awards 2026
-- Database schema for nominations, payments, privacy tickets, partner inquiries,
-- webhook receipts, and admin audit logs.
--
-- Run this script on PostgreSQL 14+ (or any version supporting pgcrypto + jsonb).

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists nominations (
  id uuid primary key default gen_random_uuid(),
  nomination_reference text not null unique,
  applicant_type text not null,
  award_category text not null,
  legal_name text not null,
  brand_name text,
  registration_type text not null,
  registration_id text not null,
  year_started text not null,
  city text not null,
  state text not null,
  country text default 'India',
  website text,
  linkedin text,
  instagram text,
  primary_contact_name text not null,
  primary_contact_role text not null,
  primary_contact_phone text not null,
  primary_contact_email text not null,
  business_summary text not null,
  key_metrics text not null,
  evidence_pack_url text not null,
  authorized_signatory_name text not null,
  authorized_signatory_designation text not null,
  status text not null default 'submitted',
  screening_status text not null default 'payment_verified',
  assigned_owner text,
  due_at timestamptz,
  payment_provider text not null,
  payment_order_id text not null,
  payment_id text not null,
  payment_status text not null,
  payment_amount_inr numeric(10,2) not null,
  payment_verified_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_provider, payment_order_id),
  unique (payment_provider, payment_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  gateway_provider text not null,
  payment_scope text not null default 'nomination-fee',
  provider_label text,
  nomination_reference text,
  legal_name text not null,
  award_category text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  order_id text not null,
  payment_id text,
  gateway_order_id text,
  gateway_payment_id text,
  amount_inr numeric(10,2) not null,
  currency text not null default 'INR',
  verification_status text not null default 'order_created',
  gateway_status text,
  payment_method text,
  site_url text,
  nomination_id uuid references nominations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  verified_payload jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gateway_provider, order_id)
);

create table if not exists payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  event_id text,
  order_id text,
  payment_id text,
  signature_valid boolean not null default false,
  status text not null default 'received',
  notes text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  request_type text not null,
  priority text not null default 'p3',
  status text not null default 'new',
  full_name text not null,
  email text not null,
  phone text,
  organization text,
  relationship text not null,
  edition text,
  category text,
  urgent text,
  url text,
  submission_reference text,
  description text not null,
  action_requested text,
  preferred_contact text,
  supporting_url text,
  identity_verified boolean not null default false,
  authority_verified boolean not null default false,
  owner_name text,
  due_at timestamptz,
  public_content_flag boolean not null default false,
  security_incident_flag boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_reference text not null unique,
  company_name text not null,
  contact_name text not null,
  contact_designation text,
  contact_email text not null,
  contact_phone text not null,
  interest_type text not null,
  message text not null,
  status text not null default 'new',
  owner_name text,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_name text,
  actor_identifier text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_nominations_status on nominations(status, screening_status, created_at desc);
create index if not exists idx_nominations_owner on nominations(assigned_owner);
create index if not exists idx_nominations_email on nominations(primary_contact_email);
create unique index if not exists idx_payments_provider_payment_id_unique on payments(gateway_provider, payment_id) where payment_id is not null;
create index if not exists idx_payments_status on payments(verification_status, gateway_status, created_at desc);
create index if not exists idx_payments_nomination on payments(nomination_id);
create index if not exists idx_privacy_status on privacy_requests(status, priority, created_at desc);
create index if not exists idx_privacy_due_at on privacy_requests(due_at);
create index if not exists idx_partner_status on partner_inquiries(status, created_at desc);
create index if not exists idx_audit_entity on admin_audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_webhooks_provider on payment_webhooks(provider, received_at desc);

drop trigger if exists trg_nominations_updated_at on nominations;
create trigger trg_nominations_updated_at
before update on nominations
for each row execute function set_updated_at();

drop trigger if exists trg_payments_updated_at on payments;
create trigger trg_payments_updated_at
before update on payments
for each row execute function set_updated_at();

drop trigger if exists trg_privacy_requests_updated_at on privacy_requests;
create trigger trg_privacy_requests_updated_at
before update on privacy_requests
for each row execute function set_updated_at();

drop trigger if exists trg_partner_inquiries_updated_at on partner_inquiries;
create trigger trg_partner_inquiries_updated_at
before update on partner_inquiries
for each row execute function set_updated_at();
