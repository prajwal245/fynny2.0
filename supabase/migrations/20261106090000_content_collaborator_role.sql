-- Content Collaborator: an admin role for people (or agents) who write the blog, press and resources.
-- A new enum value cannot be used in the same transaction that adds it, so it is used in the next migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_collaborator';
