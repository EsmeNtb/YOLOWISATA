-- ============================================================
-- YOLOWISATA
-- Row Level Security Policies
--
-- Migration:
-- 20261003_002_rls_policies.sql
--
-- Philosophy:
-- - Public tourism information can be discovered.
-- - Private traveler/business information stays private.
-- - Business owners only see their own private business data.
-- - Travelers only see their own private data.
-- - AI results are visible only to the operator they belong to.
-- - Secret/server access is handled separately by FastAPI.
-- ============================================================


-- ============================================================
-- 0. HELPER FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- Current user's application role.
--
-- We use SECURITY DEFINER so RLS on profiles does not cause
-- recursive policy problems.
-- ------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role
    from public.profiles
    where id = auth.uid()
    limit 1;
$$;


-- ------------------------------------------------------------
-- Is current user an admin?
-- ------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (
            select role = 'admin'
            from public.profiles
            where id = auth.uid()
            limit 1
        ),
        false
    );
$$;


-- ------------------------------------------------------------
-- Is current user a partner or admin?
-- Partners can perform local verification work.
-- ------------------------------------------------------------

create or replace function public.is_partner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (
            select role in ('partner', 'admin')
            from public.profiles
            where id = auth.uid()
            limit 1
        ),
        false
    );
$$;


-- ------------------------------------------------------------
-- Does current user own this business?
-- ------------------------------------------------------------

create or replace function public.owns_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.businesses b
        where b.id = target_business_id
          and b.owner_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- Does current user own this traveler profile?
-- ------------------------------------------------------------

create or replace function public.owns_traveler_profile(
    target_traveler_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.traveler_profiles tp
        where tp.id = target_traveler_id
          and tp.user_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- Does current user own the business behind this experience?
-- ------------------------------------------------------------

create or replace function public.owns_experience(
    target_experience_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.experiences e
        join public.businesses b
          on b.id = e.business_id
        where e.id = target_experience_id
          and b.owner_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- Is current user the traveler in this conversation?
-- ------------------------------------------------------------

create or replace function public.is_conversation_traveler(
    target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.conversations c
        join public.traveler_profiles tp
          on tp.id = c.traveler_id
        where c.id = target_conversation_id
          and tp.user_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- Is current user the business owner in this conversation?
-- ------------------------------------------------------------

create or replace function public.is_conversation_business_owner(
    target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.conversations c
        join public.businesses b
          on b.id = c.business_id
        where c.id = target_conversation_id
          and b.owner_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- Can current user access this conversation?
-- ------------------------------------------------------------

create or replace function public.can_access_conversation(
    target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        public.is_conversation_traveler(target_conversation_id)
        or
        public.is_conversation_business_owner(target_conversation_id)
        or
        public.is_admin();
$$;


-- ------------------------------------------------------------
-- Can current user see this AI analysis?
-- ------------------------------------------------------------

create or replace function public.can_access_analysis(
    target_analysis_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.ai_analysis_runs ar
        left join public.businesses b
          on b.id = ar.business_id
        left join public.experiences e
          on e.id = ar.experience_id
        left join public.businesses eb
          on eb.id = e.business_id
        where ar.id = target_analysis_id
          and (
              b.owner_id = auth.uid()
              or eb.owner_id = auth.uid()
              or public.is_partner_or_admin()
          )
    );
$$;


-- ============================================================
-- LOCK DOWN HELPER FUNCTIONS
-- ============================================================

revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_partner_or_admin() from public;
revoke all on function public.owns_business(uuid) from public;
revoke all on function public.owns_traveler_profile(uuid) from public;
revoke all on function public.owns_experience(uuid) from public;
revoke all on function public.is_conversation_traveler(uuid) from public;
revoke all on function public.is_conversation_business_owner(uuid) from public;
revoke all on function public.can_access_conversation(uuid) from public;
revoke all on function public.can_access_analysis(uuid) from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_partner_or_admin() to authenticated;
grant execute on function public.owns_business(uuid) to authenticated;
grant execute on function public.owns_traveler_profile(uuid) to authenticated;
grant execute on function public.owns_experience(uuid) to authenticated;
grant execute on function public.is_conversation_traveler(uuid) to authenticated;
grant execute on function public.is_conversation_business_owner(uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;
grant execute on function public.can_access_analysis(uuid) to authenticated;



-- ============================================================
-- 1. PROFILES
-- ============================================================

drop policy if exists "profiles_select_own"
on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
    or public.is_admin()
);


drop policy if exists "profiles_update_own"
on public.profiles;

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
    id = auth.uid()
)
with check (
    id = auth.uid()
);


-- IMPORTANT:
-- A user must NOT be able to promote themselves to admin.
--
-- Remove full UPDATE permission, then grant only safe columns.

revoke update on public.profiles from authenticated;

grant update (
    display_name,
    preferred_language,
    country_code,
    avatar_url
)
on public.profiles
to authenticated;



-- ============================================================
-- 2. DESTINATIONS
-- ============================================================

drop policy if exists "destinations_public_read"
on public.destinations;

create policy "destinations_public_read"
on public.destinations
for select
to anon
using (
    is_active = true
);


drop policy if exists "destinations_authenticated_read"
on public.destinations;

create policy "destinations_authenticated_read"
on public.destinations
for select
to authenticated
using (
    is_active = true
    or public.is_admin()
);



-- ============================================================
-- 3. BUSINESSES
-- ============================================================

-- Public only sees active verified businesses.

drop policy if exists "businesses_public_read"
on public.businesses;

create policy "businesses_public_read"
on public.businesses
for select
to anon
using (
    is_active = true
    and verification_status = 'verified'
);


-- Authenticated users see public businesses plus their own.

drop policy if exists "businesses_authenticated_read"
on public.businesses;

create policy "businesses_authenticated_read"
on public.businesses
for select
to authenticated
using (
    (
        is_active = true
        and verification_status = 'verified'
    )
    or owner_id = auth.uid()
    or public.is_partner_or_admin()
);


-- Any authenticated user may start a business profile,
-- but it must belong to themselves.

drop policy if exists "businesses_insert_own"
on public.businesses;

create policy "businesses_insert_own"
on public.businesses
for insert
to authenticated
with check (
    owner_id = auth.uid()
);


-- Owner may update their own business.
-- They cannot transfer ownership through this policy.

drop policy if exists "businesses_update_own"
on public.businesses;

create policy "businesses_update_own"
on public.businesses
for update
to authenticated
using (
    owner_id = auth.uid()
    or public.is_partner_or_admin()
)
with check (
    owner_id = auth.uid()
    or public.is_partner_or_admin()
);


-- Only admin may hard-delete.
-- Normal operators should use is_active = false.

drop policy if exists "businesses_admin_delete"
on public.businesses;

create policy "businesses_admin_delete"
on public.businesses
for delete
to authenticated
using (
    public.is_admin()
);



-- ============================================================
-- 4. BUSINESS VERIFICATIONS
-- ============================================================

-- Owner can see their own verification.
-- Partners/admins can see verification records.

drop policy if exists "business_verifications_read"
on public.business_verifications;

create policy "business_verifications_read"
on public.business_verifications
for select
to authenticated
using (
    public.owns_business(business_id)
    or public.is_partner_or_admin()
);


-- Only partner/admin can verify.

drop policy if exists "business_verifications_insert"
on public.business_verifications;

create policy "business_verifications_insert"
on public.business_verifications
for insert
to authenticated
with check (
    public.is_partner_or_admin()
);


drop policy if exists "business_verifications_update"
on public.business_verifications;

create policy "business_verifications_update"
on public.business_verifications
for update
to authenticated
using (
    public.is_partner_or_admin()
)
with check (
    public.is_partner_or_admin()
);



-- ============================================================
-- 5. EXPERIENCES
-- ============================================================

-- Anonymous visitor only sees active experiences belonging
-- to active verified local businesses.

drop policy if exists "experiences_public_read"
on public.experiences;

create policy "experiences_public_read"
on public.experiences
for select
to anon
using (
    is_active = true
    and exists (
        select 1
        from public.businesses b
        where b.id = business_id
          and b.is_active = true
          and b.verification_status = 'verified'
    )
);


-- Authenticated users additionally see experiences
-- belonging to their own business.

drop policy if exists "experiences_authenticated_read"
on public.experiences;

create policy "experiences_authenticated_read"
on public.experiences
for select
to authenticated
using (
    (
        is_active = true
        and exists (
            select 1
            from public.businesses b
            where b.id = business_id
              and b.is_active = true
              and b.verification_status = 'verified'
        )
    )
    or public.owns_business(business_id)
    or public.is_partner_or_admin()
);


drop policy if exists "experiences_insert_own_business"
on public.experiences;

create policy "experiences_insert_own_business"
on public.experiences
for insert
to authenticated
with check (
    public.owns_business(business_id)
    or public.is_admin()
);


drop policy if exists "experiences_update_own_business"
on public.experiences;

create policy "experiences_update_own_business"
on public.experiences
for update
to authenticated
using (
    public.owns_business(business_id)
    or public.is_admin()
)
with check (
    public.owns_business(business_id)
    or public.is_admin()
);


drop policy if exists "experiences_delete_own_business"
on public.experiences;

create policy "experiences_delete_own_business"
on public.experiences
for delete
to authenticated
using (
    public.owns_business(business_id)
    or public.is_admin()
);



-- ============================================================
-- 6. TRAVELER PROFILES
-- ============================================================

drop policy if exists "traveler_profiles_select_own"
on public.traveler_profiles;

create policy "traveler_profiles_select_own"
on public.traveler_profiles
for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_admin()
);


drop policy if exists "traveler_profiles_insert_own"
on public.traveler_profiles;

create policy "traveler_profiles_insert_own"
on public.traveler_profiles
for insert
to authenticated
with check (
    user_id = auth.uid()
);


drop policy if exists "traveler_profiles_update_own"
on public.traveler_profiles;

create policy "traveler_profiles_update_own"
on public.traveler_profiles
for update
to authenticated
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
);



-- ============================================================
-- 7. CONVERSATIONS
-- ============================================================

drop policy if exists "conversations_participant_read"
on public.conversations;

create policy "conversations_participant_read"
on public.conversations
for select
to authenticated
using (
    public.can_access_conversation(id)
);


-- Traveler OR business can initiate a conversation.

drop policy if exists "conversations_participant_insert"
on public.conversations;

create policy "conversations_participant_insert"
on public.conversations
for insert
to authenticated
with check (
    public.owns_traveler_profile(traveler_id)
    or public.owns_business(business_id)
    or public.is_admin()
);


drop policy if exists "conversations_participant_update"
on public.conversations;

create policy "conversations_participant_update"
on public.conversations
for update
to authenticated
using (
    public.can_access_conversation(id)
)
with check (
    public.can_access_conversation(id)
);



-- ============================================================
-- 8. MESSAGES
-- ============================================================

drop policy if exists "messages_participant_read"
on public.messages;

create policy "messages_participant_read"
on public.messages
for select
to authenticated
using (
    public.can_access_conversation(conversation_id)
);


-- User must:
-- 1. belong to the conversation
-- 2. use their own sender_id
-- 3. use the correct sender_type

drop policy if exists "messages_participant_insert"
on public.messages;

create policy "messages_participant_insert"
on public.messages
for insert
to authenticated
with check (
    sender_id = auth.uid()
    and (
        (
            sender_type = 'traveler'
            and public.is_conversation_traveler(conversation_id)
        )
        or
        (
            sender_type = 'business'
            and public.is_conversation_business_owner(conversation_id)
        )
    )
);

-- No user UPDATE/DELETE policy intentionally.
-- Messages become append-only from the client.
-- System messages are written by the backend.



-- ============================================================
-- 9. BOOKINGS
-- ============================================================

-- Traveler sees their own booking.
-- Business owner sees bookings for their experience.

drop policy if exists "bookings_participant_read"
on public.bookings;

create policy "bookings_participant_read"
on public.bookings
for select
to authenticated
using (
    public.owns_traveler_profile(traveler_id)
    or public.owns_experience(experience_id)
    or public.is_admin()
);


-- Traveler can create a booking only for themselves.

drop policy if exists "bookings_traveler_insert"
on public.bookings;

create policy "bookings_traveler_insert"
on public.bookings
for insert
to authenticated
with check (
    public.owns_traveler_profile(traveler_id)
);


-- Business owner decides pending / confirmed / rejected / completed.
--
-- Traveler cancellation should go through FastAPI so we can validate
-- the status transition instead of allowing arbitrary status edits.

drop policy if exists "bookings_business_update"
on public.bookings;

create policy "bookings_business_update"
on public.bookings
for update
to authenticated
using (
    public.owns_experience(experience_id)
    or public.is_admin()
)
with check (
    public.owns_experience(experience_id)
    or public.is_admin()
);



-- ============================================================
-- 10. POSTCARDS
-- ============================================================

-- Public postcards require explicit consent_for_public.

drop policy if exists "postcards_public_read"
on public.postcards;

create policy "postcards_public_read"
on public.postcards
for select
to anon
using (
    consent_for_public = true
);


-- Authenticated user can see:
-- - public postcards
-- - their own postcards
-- - postcards for their business

drop policy if exists "postcards_authenticated_read"
on public.postcards;

create policy "postcards_authenticated_read"
on public.postcards
for select
to authenticated
using (
    consent_for_public = true
    or public.owns_traveler_profile(traveler_id)
    or public.owns_experience(experience_id)
    or public.is_admin()
);


drop policy if exists "postcards_insert_own"
on public.postcards;

create policy "postcards_insert_own"
on public.postcards
for insert
to authenticated
with check (
    public.owns_traveler_profile(traveler_id)
);


drop policy if exists "postcards_update_own"
on public.postcards;

create policy "postcards_update_own"
on public.postcards
for update
to authenticated
using (
    public.owns_traveler_profile(traveler_id)
)
with check (
    public.owns_traveler_profile(traveler_id)
);


drop policy if exists "postcards_delete_own"
on public.postcards;

create policy "postcards_delete_own"
on public.postcards
for delete
to authenticated
using (
    public.owns_traveler_profile(traveler_id)
);



-- ============================================================
-- 11. LOCAL POINTS
-- ============================================================

-- Public only sees verified essentials / Welcome Spots.

drop policy if exists "local_points_public_read"
on public.local_points;

create policy "local_points_public_read"
on public.local_points
for select
to anon
using (
    verified = true
);


drop policy if exists "local_points_authenticated_read"
on public.local_points;

create policy "local_points_authenticated_read"
on public.local_points
for select
to authenticated
using (
    verified = true
    or public.is_partner_or_admin()
);


-- Only community partner/admin creates or modifies verified points.

drop policy if exists "local_points_partner_insert"
on public.local_points;

create policy "local_points_partner_insert"
on public.local_points
for insert
to authenticated
with check (
    public.is_partner_or_admin()
);


drop policy if exists "local_points_partner_update"
on public.local_points;

create policy "local_points_partner_update"
on public.local_points
for update
to authenticated
using (
    public.is_partner_or_admin()
)
with check (
    public.is_partner_or_admin()
);



-- ============================================================
-- 12. PRICE GUIDES
-- ============================================================

-- Reference price data may be read publicly.

drop policy if exists "price_guides_public_read"
on public.price_guides;

create policy "price_guides_public_read"
on public.price_guides
for select
to anon
using (true);


drop policy if exists "price_guides_authenticated_read"
on public.price_guides;

create policy "price_guides_authenticated_read"
on public.price_guides
for select
to authenticated
using (true);


-- Only partner/admin may maintain reference-price datasets.

drop policy if exists "price_guides_partner_insert"
on public.price_guides;

create policy "price_guides_partner_insert"
on public.price_guides
for insert
to authenticated
with check (
    public.is_partner_or_admin()
);


drop policy if exists "price_guides_partner_update"
on public.price_guides;

create policy "price_guides_partner_update"
on public.price_guides
for update
to authenticated
using (
    public.is_partner_or_admin()
)
with check (
    public.is_partner_or_admin()
);



-- ============================================================
-- 13. AI ANALYSIS RUNS
-- ============================================================

-- Business AI results are private.
-- AI writes are normally performed by FastAPI / backend.

drop policy if exists "ai_analysis_owner_read"
on public.ai_analysis_runs;

create policy "ai_analysis_owner_read"
on public.ai_analysis_runs
for select
to authenticated
using (
    (
        business_id is not null
        and public.owns_business(business_id)
    )
    or
    (
        experience_id is not null
        and public.owns_experience(experience_id)
    )
    or public.is_partner_or_admin()
);


-- No frontend INSERT policy.
-- Backend creates analysis runs.



-- ============================================================
-- 14. AI INSIGHT EVIDENCE
-- ============================================================

drop policy if exists "ai_evidence_owner_read"
on public.ai_insight_evidence;

create policy "ai_evidence_owner_read"
on public.ai_insight_evidence
for select
to authenticated
using (
    public.can_access_analysis(analysis_run_id)
);


-- No direct client writes.
-- FastAPI/model pipeline creates evidence rows.



-- ============================================================
-- 15. BUSINESS OPPORTUNITIES
-- ============================================================

drop policy if exists "business_opportunities_owner_read"
on public.business_opportunities;

create policy "business_opportunities_owner_read"
on public.business_opportunities
for select
to authenticated
using (
    public.owns_business(business_id)
    or public.is_partner_or_admin()
);


-- AI creates opportunities through backend.
-- Business owner only decides what happens with it.

drop policy if exists "business_opportunities_owner_update"
on public.business_opportunities;

create policy "business_opportunities_owner_update"
on public.business_opportunities
for update
to authenticated
using (
    public.owns_business(business_id)
    or public.is_admin()
)
with check (
    public.owns_business(business_id)
    or public.is_admin()
);



-- ============================================================
-- 16. DATASET REGISTRY
-- ============================================================

-- We WANT judges/researchers to see what datasets we use,
-- including licenses and limitations.

drop policy if exists "dataset_registry_public_read"
on public.dataset_registry;

create policy "dataset_registry_public_read"
on public.dataset_registry
for select
to anon
using (true);


drop policy if exists "dataset_registry_authenticated_read"
on public.dataset_registry;

create policy "dataset_registry_authenticated_read"
on public.dataset_registry
for select
to authenticated
using (true);


-- Dataset registry is maintained by trusted project users only.

drop policy if exists "dataset_registry_admin_insert"
on public.dataset_registry;

create policy "dataset_registry_admin_insert"
on public.dataset_registry
for insert
to authenticated
with check (
    public.is_admin()
);


drop policy if exists "dataset_registry_admin_update"
on public.dataset_registry;

create policy "dataset_registry_admin_update"
on public.dataset_registry
for update
to authenticated
using (
    public.is_admin()
)
with check (
    public.is_admin()
);



-- ============================================================
-- 17. DESTINATION PACK VERSIONS
-- ============================================================

-- Anonymous users only see the current downloadable pack.

drop policy if exists "destination_packs_public_read"
on public.destination_pack_versions;

create policy "destination_packs_public_read"
on public.destination_pack_versions
for select
to anon
using (
    is_current = true
);


drop policy if exists "destination_packs_authenticated_read"
on public.destination_pack_versions;

create policy "destination_packs_authenticated_read"
on public.destination_pack_versions
for select
to authenticated
using (
    is_current = true
    or public.is_admin()
);



-- ============================================================
-- 18. TABLE PRIVILEGES
--
-- RLS controls WHICH rows can be used.
-- GRANT controls WHICH operations are even available.
-- ============================================================

grant usage on schema public to anon, authenticated;


-- ------------------------------------------------------------
-- PUBLIC / ANONYMOUS READ ACCESS
-- ------------------------------------------------------------

grant select on public.destinations to anon;
grant select on public.businesses to anon;
grant select on public.experiences to anon;
grant select on public.postcards to anon;
grant select on public.local_points to anon;
grant select on public.price_guides to anon;
grant select on public.dataset_registry to anon;
grant select on public.destination_pack_versions to anon;


-- ------------------------------------------------------------
-- AUTHENTICATED READ ACCESS
-- ------------------------------------------------------------

grant select on public.profiles to authenticated;
grant select on public.destinations to authenticated;
grant select on public.businesses to authenticated;
grant select on public.business_verifications to authenticated;
grant select on public.experiences to authenticated;
grant select on public.traveler_profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.bookings to authenticated;
grant select on public.postcards to authenticated;
grant select on public.local_points to authenticated;
grant select on public.price_guides to authenticated;
grant select on public.ai_analysis_runs to authenticated;
grant select on public.ai_insight_evidence to authenticated;
grant select on public.business_opportunities to authenticated;
grant select on public.dataset_registry to authenticated;
grant select on public.destination_pack_versions to authenticated;


-- ------------------------------------------------------------
-- AUTHENTICATED WRITE ACCESS
--
-- These permissions still pass through RLS.
-- ------------------------------------------------------------

-- Businesses
-- Authenticated users may create their own business.
grant insert on public.businesses to authenticated;

-- Remove blanket UPDATE permission.
revoke update on public.businesses from authenticated;

-- Business owners may only modify safe public/business fields.
grant update (
    name,
    description,
    sector,
    local_language,
    phone,
    whatsapp,
    latitude,
    longitude,
    human_directions,
    payment_methods,
    opening_hours,
    is_local,
    is_active,
    revision
)
on public.businesses
to authenticated;

grant insert, update, delete
on public.experiences
to authenticated;

grant insert, update
on public.business_verifications
to authenticated;

grant insert, update
on public.traveler_profiles
to authenticated;

grant insert, update
on public.conversations
to authenticated;

grant insert
on public.messages
to authenticated;

grant insert, update
on public.bookings
to authenticated;

grant insert, update, delete
on public.postcards
to authenticated;

grant insert, update
on public.local_points
to authenticated;

grant insert, update
on public.price_guides
to authenticated;

grant update
on public.business_opportunities
to authenticated;

grant insert, update
on public.dataset_registry
to authenticated;
