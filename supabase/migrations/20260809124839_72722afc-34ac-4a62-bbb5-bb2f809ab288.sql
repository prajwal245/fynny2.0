ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_category_check;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_category_check CHECK (
    category = ANY (ARRAY[
      'GST','Cash flow','MSME','Startup finance','Compliance','CA resources','Hiring',
      'Playbooks','Runway','Investor updates','Product updates','Founder stories','Other'
    ]::text[])
  );