ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_status_check CHECK (status = ANY (ARRAY['draft','published','scheduled','archived']));

CREATE OR REPLACE FUNCTION public.publish_due_blog_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.blog_posts
     SET status = 'published', updated_at = now()
   WHERE status = 'scheduled'
     AND published_at IS NOT NULL
     AND published_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT cron.schedule('publish-due-blog-posts','*/5 * * * *', $$select public.publish_due_blog_posts();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-due-blog-posts');