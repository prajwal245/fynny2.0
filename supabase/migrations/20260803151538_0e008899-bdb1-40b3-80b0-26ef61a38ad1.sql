ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS seo_title varchar(60);
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS seo_description varchar(160);
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS og_image text;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;