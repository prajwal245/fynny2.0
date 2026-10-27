import { POSTS_A } from "./posts-a";
import { POSTS_B } from "./posts-b";
import type { StaticPost } from "./shared";

export type { StaticPost } from "./shared";

/** Articles that live in the codebase. They show from their publish date, and the database can override a slug. */
export const STATIC_POSTS: StaticPost[] = [...POSTS_A, ...POSTS_B];

export const publishedStatic = (now = Date.now()) => STATIC_POSTS.filter((p) => new Date(p.published_at).getTime() <= now);
