-- The practice app moved from /v2 to /app. Point links inside articles there
-- (old links also redirect, so this only saves a hop).
update public.blog_posts
   set content = replace(content, 'href="/v2/', 'href="/app/'),
       updated_at = now()
 where content like '%href="/v2/%';
