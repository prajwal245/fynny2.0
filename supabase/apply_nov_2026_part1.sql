-- FynHelp: November 2026 database changes, part 1 of 2. Run this first, on its own, then run part 2.
-- (A new role value must be saved before anything can use it.) Safe to run again.

-- Content Collaborator: an admin role for people (or agents) who write the blog, press and resources.
-- A new enum value cannot be used in the same transaction that adds it, so it is used in the next migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_collaborator';
