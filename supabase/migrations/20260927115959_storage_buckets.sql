-- Storage buckets the app and its storage policies rely on. They were created
-- by hand in the hosted project, so a fresh project needs them here.
-- ON CONFLICT DO NOTHING keeps existing buckets (and their settings) untouched.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('ca-client-documents', 'ca-client-documents', false),
  ('ca-reports', 'ca-reports', false),
  ('ca-verification-documents', 'ca-verification-documents', false),
  ('financial-imports', 'financial-imports', false),
  ('profile-photos', 'profile-photos', false),
  ('reports', 'reports', false),
  ('resource-files', 'resource-files', false),
  ('resources', 'resources', true),
  ('blog-images', 'blog-images', true),
  ('site-media', 'site-media', true)
ON CONFLICT (id) DO NOTHING;
