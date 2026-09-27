# Blog panel redesign (reference-inspired)

Rework how blog posts look on `/resources?tab=blog` and on the article page `/blog/:slug`, matching the structure of the reference: cover-image cards with a category pill, date and read time, bold title, two-line excerpt, and a "Read article →" link; article pages that lead with the meta line, title, subtitle and byline before a large rounded cover image.

## Blog list cards (Resources > Blog)

- Add `cover_image_url` and `author_name` to the published-posts query (currently not selected, so cards have no image).
- New card layout, three per row on desktop, one on mobile:
  - 16:9 cover image at the top, rounded top corners, lazy-loaded; a subtle branded placeholder block when a post has no cover.
  - Meta row: rounded category pill + date (e.g. "14 Aug 2026") + "X min read".
  - Title in Clash Display, 2-line clamp.
  - Excerpt in body font, 3-line clamp.
  - Footer: "Read article →" in accent red with a small arrow that slides on hover.
- Card hover: gentle lift and shadow (reuse existing `.rs-card` transition).
- Views count moves out of the visible footer to keep the card clean.

## Article page (`/blog/:slug`)

- Reorder the header to match the reference: back link, then meta row (category pill · date · read time), then large title, then excerpt as a plain subtitle (not italic serif), then "By {author}".
- Cover image rendered full-width below the header with rounded corners, when the post has one.
- Widen the reading column slightly (720 → 760px) and keep the existing sanitized `.fyn-article` body styles.
- Keep the existing author/meta strip below the article, unchanged otherwise.

## Styling

Structure and rhythm follow the reference; colours and type stay on FynHelp brand — beige page, white cards, ink text, red accent, Clash Display headings and Satoshi/Inter body. No blue/lavender palette from the reference screenshots.

## Technical notes

- Files: `src/pages/ResourcesPage.tsx` (blog tab markup + `.rs-blog-*` CSS in the existing style block), `src/pages/BlogArticlePage.tsx` (header order, cover image, column width).
- Uses the existing `blog_posts.cover_image_url` column; no schema or backend changes.
- Standalone `/blog` index page (`BlogPage.tsx`, static list) is left as-is unless you want it aligned too.
