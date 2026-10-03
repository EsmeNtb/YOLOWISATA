-- ============================================================
-- YOLOWISATA
-- Initial Demo Data
-- ============================================================


-- ============================================================
-- DESTINATION
-- ============================================================

insert into public.destinations (
    slug,
    name,
    country_code,
    region,
    default_language,
    latitude,
    longitude
)
values (
    'yogyakarta',
    'Yogyakarta',
    'ID',
    'Special Region of Yogyakarta',
    'id',
    -7.7956,
    110.3695
)
on conflict (slug) do nothing;


-- ============================================================
-- DEMO BUSINESS
-- ============================================================

insert into public.businesses (
    destination_id,
    name,
    description,
    sector,
    local_language,
    verification_status
)
select
    id,
    'Noor Coffee Farm',
    'Small family-owned coffee farm experience.',
    'farm',
    'id',
    'verified'
from public.destinations
where slug = 'yogyakarta'
and not exists (
    select 1
    from public.businesses
    where name = 'Noor Coffee Farm'
);

-- ============================================================
-- DEMO EXPERIENCE
-- ============================================================

insert into public.experiences (
    business_id,
    title,
    description,
    price,
    currency,
    duration_minutes,
    capacity,
    availability,
    activities,
    experience_dna,
    is_active
)
select
    b.id,
    'Coffee Farm & Roasting Walk',
    'Walk through Noor''s coffee farm, learn how coffee is grown and roasted, and hear the story of the family farm.',
    12.00,
    'USD',
    90,
    8,
    '{"days":["monday","tuesday","wednesday","thursday","friday","saturday"],"start_times":["09:00","14:00"]}'::jsonb,
    '["farm_walk","coffee_roasting","local_story"]'::jsonb,
    '{}'::jsonb,
    true
from public.businesses b
where b.name = 'Noor Coffee Farm'
and not exists (
    select 1
    from public.experiences e
    where e.business_id = b.id
      and e.title = 'Coffee Farm & Roasting Walk'
);


-- ============================================================
-- DEMO POSTCARDS
-- Synthetic hackathon feedback for Experience DNA
-- ============================================================

with target_experience as (
    select e.id
    from public.experiences e
    join public.businesses b
      on b.id = e.business_id
    where b.name = 'Noor Coffee Farm'
      and e.title = 'Coffee Farm & Roasting Walk'
    limit 1
),
feedback(display_name, country_code, message, language) as (
    values
        (
            'Maya',
            'MX',
            'I loved seeing how the coffee was roasted. I would love a tasting with different roasts.',
            'en'
        ),
        (
            'Ari',
            'ID',
            'Proses sangrai kopinya sangat menarik. Saya ingin mencoba memanggang kopi sendiri.',
            'id'
        ),
        (
            'Daniel',
            'US',
            'The farm walk was beautiful and Noor made us feel very welcome.',
            'en'
        ),
        (
            'Sinta',
            'ID',
            'Saya suka berjalan di kebun kopi dan mendengar cerita tentang keluarga Noor.',
            'id'
        ),
        (
            'Emma',
            'GB',
            'Could visitors buy coffee beans after the tour? I would have bought a bag.',
            'en'
        ),
        (
            'Lucas',
            'BR',
            'The roasting demonstration was my favorite part of the visit.',
            'en'
        ),
        (
            'Nadia',
            'MY',
            'A coffee tasting at the end would make the experience even better.',
            'en'
        ),
        (
            'Rizky',
            'ID',
            'Petunjuk menuju kebun agak sulit ditemukan, tetapi pengalaman kopinya sangat bagus.',
            'id'
        ),
        (
            'Anna',
            'DE',
            'I would love a hands-on activity where visitors roast their own coffee.',
            'en'
        ),
        (
            'Kenji',
            'JP',
            'The family hospitality and quiet farm atmosphere were memorable.',
            'en'
        )
)
insert into public.postcards (
    experience_id,
    display_name,
    country_code,
    message,
    language,
    consent_for_public,
    consent_for_analysis
)
select
    te.id,
    f.display_name,
    f.country_code,
    f.message,
    f.language,
    true,
    true
from target_experience te
cross join feedback f
where not exists (
    select 1
    from public.postcards p
    where p.experience_id = te.id
      and p.message = f.message
);