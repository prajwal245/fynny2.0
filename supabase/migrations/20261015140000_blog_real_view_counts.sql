-- Six early posts were seeded with made-up view counts. Remove the seeded
-- starting number so admin totals show only real visits (counted since by
-- increment_blog_views). Never below zero.
update public.blog_posts as p
   set views = greatest(coalesce(p.views, 0) - s.seeded, 0)
  from (values
    ('5-signs-you-need-ai-cfo', 1200),
    ('section-43b-h-msme-payment-law', 2400),
    ('how-we-cut-dso-67-to-41-days', 890),
    ('gst-rate-rationalisation-2026', 3100),
    ('compliance-calendar-fy-2026-27', 1800),
    ('ca-vs-cfo-for-indian-sme', 1400)
  ) as s(slug, seeded)
 where p.slug = s.slug
   and coalesce(p.views, 0) >= s.seeded;
