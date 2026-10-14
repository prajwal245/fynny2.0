-- Retire posts written for the old "AI CFO for SMEs" positioning. The site
-- answers 410 Gone for these paths so search engines drop them.
update public.blog_posts
   set status = 'draft', updated_at = now()
 where slug in ('ca-vs-cfo-for-indian-sme', 'budgetvsforecast', '5-signs-you-need-ai-cfo')
   and status <> 'draft';
