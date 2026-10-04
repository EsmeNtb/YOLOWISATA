-- ============================================================
-- YOLOWISATA
-- Indexes
-- Migration: 20261003_003_indexes.sql
-- ============================================================


-- ============================================================
-- RELATIONAL INDEXES
-- ============================================================

create index if not exists idx_businesses_destination
on public.businesses(destination_id);

create index if not exists idx_businesses_owner
on public.businesses(owner_id);

create index if not exists idx_businesses_verified
on public.businesses(verification_status)
where verification_status = 'verified';


create index if not exists idx_experiences_business
on public.experiences(business_id);


create index if not exists idx_conversations_business
on public.conversations(business_id);

create index if not exists idx_conversations_traveler
on public.conversations(traveler_id);


create index if not exists idx_messages_conversation_created
on public.messages(conversation_id, created_at);


create index if not exists idx_bookings_experience
on public.bookings(experience_id);

create index if not exists idx_bookings_traveler
on public.bookings(traveler_id);

create index if not exists idx_bookings_visit_date
on public.bookings(visit_date);


create index if not exists idx_postcards_experience
on public.postcards(experience_id);

create index if not exists idx_postcards_created
on public.postcards(created_at desc);


create index if not exists idx_local_points_destination
on public.local_points(destination_id);

create index if not exists idx_local_points_category
on public.local_points(category);


create index if not exists idx_price_guides_destination
on public.price_guides(destination_id);


create index if not exists idx_ai_analysis_business
on public.ai_analysis_runs(business_id);

create index if not exists idx_ai_analysis_experience
on public.ai_analysis_runs(experience_id);


create index if not exists idx_ai_evidence_analysis
on public.ai_insight_evidence(analysis_run_id);


create index if not exists idx_opportunities_business
on public.business_opportunities(business_id);


create index if not exists idx_destination_pack_destination
on public.destination_pack_versions(destination_id);


-- ============================================================
-- DESTINATION PACK VERSION CONSTRAINT
-- Only one current pack per destination.
-- ============================================================

create unique index if not exists idx_one_current_pack_per_destination
on public.destination_pack_versions(destination_id)
where is_current = true;


-- ============================================================
-- JSONB / GIN INDEXES
-- ============================================================

create index if not exists idx_experience_dna_gin
on public.experiences
using gin (experience_dna);

create index if not exists idx_travel_dna_gin
on public.traveler_profiles
using gin (travel_dna);

create index if not exists idx_ai_results_gin
on public.ai_analysis_runs
using gin (result_json);