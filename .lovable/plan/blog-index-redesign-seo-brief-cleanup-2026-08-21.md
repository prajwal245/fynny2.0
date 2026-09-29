# Blog index redesign + SEO-brief cleanup

Scope: the standalone `/blog` page only. Resources > Blog tab stays as-is.

## 1. Strip the SEO brief text from posts

Some posts have their SEO worksheet pasted into the body — "SEO Title", "Meta Description", "URL Slug", "Primary Keyword", "Secondary Keywords", "Semantic Keywords", "Search Intent", "Target Audience", "Funnel Stage". That block is leaking into the card excerpts and the article page.

- Add a cleaner that detects and removes this block (a labelled table, definition list, or a run of `Label: value` lines using those known SEO field names) before rendering.
- Apply it to the article body on `/blog/:slug` and to excerpts on the blog index.
- Where an excerpt is empty or was entirely SEO text, fall back to the first real paragraph of the cleaned body.
- Also run a one-time database cleanup on published posts so the stored content no longer carries the block, with the render-time cleaner staying in place as a safety net for future pastes.

## 2. Remove author bylines

Drop "By {author}" and the "{author} · {date}" footer from the `/blog` cards and from the article header. Date and read time stay.

## 3. Huntlo-style structure for /blog

- Header: small "RESOURCES" eyebrow, large "The FynHelp Journal" title, one-line subtitle — on the beige page background rather than the current dark ink band.
- Category filter chips below the header: "All" plus the categories actually present in published posts; clicking filters the list client-side.
- Featured post: newest (or `is_featured`) post as a wide two-column card — cover image left, meta row (category pill · date · read time), title, 3-line excerpt, and a "Read article →" link right.
- Remaining posts: 3-column grid on desktop, 2 on tablet, 1 on mobile. Each card is a 16:9 cover, category pill, date, read time, 2-line title, 3-line excerpt, "Read article →".
- Cards use the existing FynHelp beige/white/ink/red palette and Clash Display + Satoshi type — no blue from the reference.
- Empty state when a filter has no posts.

## Technical notes

- Files: `src/pages/BlogPage.tsx` (layout, filters, byline removal), `src/pages/BlogArticlePage.tsx` (byline + body cleaning), new helper in `src/lib/` for the SEO-block stripper.
- Card styles follow the existing `.rs-blog-*` patterns from `ResourcesPage.tsx` so both listings look related.
- No schema changes; the cleanup is a data update on existing `blog_posts` rows plus a render-time filter.
