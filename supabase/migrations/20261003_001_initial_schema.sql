-- ============================================================
-- YOLOWISATA DATABASE SCHEMA
-- PostgreSQL / Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- HELPER: AUTOMATIC updated_at
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- 1. PROFILES
-- Extends Supabase auth.users
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  role text not null default 'traveler'
    check (role in ('traveler', 'business_owner', 'partner', 'admin')),

  display_name text,
  preferred_language text not null default 'en',
  country_code text,
  avatar_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- Automatically create a profile after signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    preferred_language
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ============================================================
-- 2. DESTINATIONS
-- ============================================================

create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique,
  name text not null,
  country_code text not null,
  region text,
  description text,

  default_language text not null default 'en',

  latitude double precision,
  longitude double precision,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger destinations_set_updated_at
before update on public.destinations
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. BUSINESSES
-- ============================================================

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid references public.profiles(id)
    on delete set null,

  destination_id uuid not null
    references public.destinations(id)
    on delete cascade,

  name text not null,
  description text,

  sector text not null default 'other'
    check (
      sector in (
        'farm',
        'workshop',
        'kitchen',
        'guide',
        'homestay',
        'agency',
        'restaurant',
        'cafe',
        'artisan',
        'market',
        'transport',
        'other'
      )
    ),

  local_language text,

  phone text,
  whatsapp text,

  latitude double precision,
  longitude double precision,

  human_directions text,

  payment_methods jsonb not null default '[]'::jsonb,
  opening_hours jsonb not null default '{}'::jsonb,

  verification_status text not null default 'pending'
    check (
      verification_status in (
        'pending',
        'verified',
        'rejected'
      )
    ),

  is_local boolean not null default true,
  is_active boolean not null default true,

  revision integer not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_set_updated_at
before update on public.businesses
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. BUSINESS VERIFICATIONS
-- ============================================================

create table if not exists public.business_verifications (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null
    references public.businesses(id)
    on delete cascade,

  verified_by uuid
    references public.profiles(id)
    on delete set null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'verified',
        'rejected'
      )
    ),

  method text
    check (
      method is null
      or method in (
        'in_person',
        'community_partner',
        'document',
        'phone',
        'other'
      )
    ),

  notes text,

  verified_at timestamptz,

  created_at timestamptz not null default now()
);


-- ============================================================
-- 5. EXPERIENCES
-- ============================================================

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null
    references public.businesses(id)
    on delete cascade,

  title text not null,
  description text,

  price numeric(12,2)
    check (price is null or price >= 0),

  currency text not null default 'USD',

  duration_minutes integer
    check (
      duration_minutes is null
      or duration_minutes > 0
    ),

  capacity integer
    check (
      capacity is null
      or capacity > 0
    ),

  availability jsonb not null default '{}'::jsonb,
  activities jsonb not null default '[]'::jsonb,

  experience_dna jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,

  revision integer not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger experiences_set_updated_at
before update on public.experiences
for each row
execute function public.set_updated_at();


-- ============================================================
-- 6. TRAVELER PROFILES
-- ============================================================

create table if not exists public.traveler_profiles (
  id uuid primary key default gen_random_uuid(),

  user_id uuid unique
    references public.profiles(id)
    on delete cascade,

  preferred_language text not null default 'en',
  country_code text,

  travel_dna jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger traveler_profiles_set_updated_at
before update on public.traveler_profiles
for each row
execute function public.set_updated_at();


-- ============================================================
-- 7. CONVERSATIONS
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null
    references public.businesses(id)
    on delete cascade,

  traveler_id uuid not null
    references public.traveler_profiles(id)
    on delete cascade,

  status text not null default 'open'
    check (
      status in (
        'open',
        'closed',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();


-- ============================================================
-- 8. MESSAGES
-- ============================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null
    references public.conversations(id)
    on delete cascade,

  sender_id uuid
    references public.profiles(id)
    on delete set null,

  sender_type text not null
    check (
      sender_type in (
        'traveler',
        'business',
        'system'
      )
    ),

  message_type text not null default 'text'
    check (
      message_type in (
        'text',
        'voice',
        'system'
      )
    ),

  original_text text,
  original_language text,

  translated_text text,
  translated_language text,

  audio_path text,

  detected_intent text,

  intent_confidence numeric(5,4)
    check (
      intent_confidence is null
      or (
        intent_confidence >= 0
        and intent_confidence <= 1
      )
    ),

  revision integer not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  synced_at timestamptz
);


-- ============================================================
-- 9. BOOKINGS
-- ============================================================

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),

  experience_id uuid not null
    references public.experiences(id)
    on delete cascade,

  traveler_id uuid not null
    references public.traveler_profiles(id)
    on delete cascade,

  visit_date date not null,
  visit_time time,

  party_size integer not null default 1
    check (party_size > 0),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'confirmed',
        'rejected',
        'cancelled',
        'completed'
      )
    ),

  notes text,

  revision integer not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookings_set_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();


-- ============================================================
-- 10. POSTCARDS
-- ============================================================

create table if not exists public.postcards (
  id uuid primary key default gen_random_uuid(),

  experience_id uuid not null
    references public.experiences(id)
    on delete cascade,

  traveler_id uuid
    references public.traveler_profiles(id)
    on delete set null,

  display_name text not null default 'Traveler',
  country_code text,

  message text not null,

  language text not null default 'en',

  photo_path text,
  audio_path text,

  background_style text not null default 'default',

  stickers jsonb not null default '[]'::jsonb,

  consent_for_public boolean not null default false,
  consent_for_analysis boolean not null default false,

  revision integer not null default 1
    check (revision >= 1),

  created_at timestamptz not null default now(),
  synced_at timestamptz
);


-- ============================================================
-- 11. LOCAL POINTS
-- Wi-Fi, charging, ATM, clinic, rest areas, etc.
-- ============================================================

create table if not exists public.local_points (
  id uuid primary key default gen_random_uuid(),

  destination_id uuid not null
    references public.destinations(id)
    on delete cascade,

  name text not null,

  category text not null
    check (
      category in (
        'wifi',
        'rest',
        'water',
        'atm',
        'clinic',
        'pharmacy',
        'toilet',
        'transport',
        'charging',
        'waste',
        'tourist_help',
        'other'
      )
    ),

  description text,

  latitude double precision not null,
  longitude double precision not null,

  opening_hours jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  verified boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger local_points_set_updated_at
before update on public.local_points
for each row
execute function public.set_updated_at();


-- ============================================================
-- 12. PRICE GUIDES
-- ============================================================

create table if not exists public.price_guides (
  id uuid primary key default gen_random_uuid(),

  destination_id uuid not null
    references public.destinations(id)
    on delete cascade,

  category text not null,
  item_name text not null,

  minimum_price numeric(12,2)
    check (
      minimum_price is null
      or minimum_price >= 0
    ),

  maximum_price numeric(12,2)
    check (
      maximum_price is null
      or maximum_price >= 0
    ),

  currency text not null,

  source text,
  source_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    maximum_price is null
    or minimum_price is null
    or maximum_price >= minimum_price
  )
);

create trigger price_guides_set_updated_at
before update on public.price_guides
for each row
execute function public.set_updated_at();


-- ============================================================
-- 13. AI ANALYSIS RUNS
-- Trace every important AI analysis.
-- ============================================================

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),

  business_id uuid
    references public.businesses(id)
    on delete cascade,

  experience_id uuid
    references public.experiences(id)
    on delete cascade,

  analysis_type text not null
    check (
      analysis_type in (
        'experience_dna',
        'intent',
        'translation',
        'listing_extraction',
        'theme_analysis',
        'travel_match'
      )
    ),

  model_name text not null,
  model_version text,

  input_count integer not null default 0
    check (input_count >= 0),

  result_json jsonb not null default '{}'::jsonb,
  confidence_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);


-- ============================================================
-- 14. AI INSIGHT EVIDENCE
-- Shows why an AI insight exists.
-- ============================================================

create table if not exists public.ai_insight_evidence (
  id uuid primary key default gen_random_uuid(),

  analysis_run_id uuid not null
    references public.ai_analysis_runs(id)
    on delete cascade,

  source_type text not null
    check (
      source_type in (
        'postcard',
        'message',
        'review',
        'question',
        'voice_note',
        'other'
      )
    ),

  -- Generic UUID because evidence may come from different tables.
  source_id uuid,

  theme text,
  quote_excerpt text,

  confidence numeric(5,4)
    check (
      confidence is null
      or (
        confidence >= 0
        and confidence <= 1
      )
    ),

  created_at timestamptz not null default now()
);


-- ============================================================
-- 15. BUSINESS OPPORTUNITIES
-- AI suggests. Human decides.
-- ============================================================

create table if not exists public.business_opportunities (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null
    references public.businesses(id)
    on delete cascade,

  experience_id uuid
    references public.experiences(id)
    on delete set null,

  analysis_run_id uuid
    references public.ai_analysis_runs(id)
    on delete set null,

  title text not null,
  description text not null,

  opportunity_type text not null
    check (
      opportunity_type in (
        'new_experience',
        'product',
        'schedule',
        'pricing',
        'directions',
        'food',
        'collaboration',
        'other'
      )
    ),

  evidence_count integer not null default 0
    check (evidence_count >= 0),

  evidence_level text not null default 'early'
    check (
      evidence_level in (
        'early',
        'emerging',
        'strong'
      )
    ),

  status text not null default 'suggested'
    check (
      status in (
        'suggested',
        'saved',
        'dismissed',
        'testing',
        'adopted'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_opportunities_set_updated_at
before update on public.business_opportunities
for each row
execute function public.set_updated_at();


-- ============================================================
-- 16. DATASET REGISTRY
-- For World Bank documentation / data grounding.
-- ============================================================

create table if not exists public.dataset_registry (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  provider text not null,

  source_url text,
  license text,
  version_or_year text,

  country text,

  languages jsonb not null default '[]'::jsonb,

  size_description text,

  purpose text not null,
  known_limitations text,

  created_at timestamptz not null default now()
);


-- ============================================================
-- 17. DESTINATION PACK VERSIONS
-- Offline downloadable packs.
-- ============================================================

create table if not exists public.destination_pack_versions (
  id uuid primary key default gen_random_uuid(),

  destination_id uuid not null
    references public.destinations(id)
    on delete cascade,

  version integer not null default 1
    check (version >= 1),

  file_url text,
  checksum text,

  size_bytes bigint not null default 0
    check (size_bytes >= 0),

  published_at timestamptz not null default now(),

  is_current boolean not null default true,

  unique(destination_id, version)
);
