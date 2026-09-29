
-- INTEGRATION TOKENS
CREATE TABLE public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage integration tokens" ON public.integration_tokens
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE TRIGGER trg_integration_tokens_updated BEFORE UPDATE ON public.integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SOCIAL POSTS
CREATE TABLE public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  post_type TEXT,
  content TEXT NOT NULL,
  media_urls TEXT[],
  target_audience TEXT,
  recipient_count INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  metrics JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage social posts" ON public.social_posts
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE INDEX idx_social_posts_platform ON public.social_posts(platform, created_at DESC);
CREATE INDEX idx_social_posts_status ON public.social_posts(status);

-- WHATSAPP MESSAGES
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_post_id UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  recipient_phone TEXT,
  recipient_count INTEGER,
  message_text TEXT NOT NULL,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by UUID,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage whatsapp messages" ON public.whatsapp_messages
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- SUPPORT TICKETS
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1000;
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL DEFAULT ('TKT-' || LPAD(NEXTVAL('public.ticket_number_seq')::TEXT, 6, '0')),
  user_id UUID,
  business_id UUID,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_user());
CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (is_admin_user());
CREATE POLICY "Admins delete tickets" ON public.support_tickets
  FOR DELETE TO authenticated USING (is_admin_user());
CREATE INDEX idx_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX idx_tickets_user ON public.support_tickets(user_id);
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TICKET REPLIES
CREATE TABLE public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reply select" ON public.ticket_replies
  FOR SELECT TO authenticated USING (
    is_admin_user() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_replies.ticket_id AND t.user_id = auth.uid()
    )
  );
CREATE POLICY "Reply insert" ON public.ticket_replies
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND (
      is_admin_user() OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_replies.ticket_id AND t.user_id = auth.uid()
      )
    )
  );
CREATE INDEX idx_ticket_replies_ticket ON public.ticket_replies(ticket_id, created_at ASC);

-- BLOG POSTS
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT,
  excerpt TEXT,
  featured_image TEXT,
  category TEXT,
  tags TEXT[],
  status TEXT NOT NULL DEFAULT 'draft',
  author_id UUID,
  published_at TIMESTAMPTZ,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published posts" ON public.blog_posts
  FOR SELECT USING (status = 'published' OR is_admin_user());
CREATE POLICY "Admins manage blog posts" ON public.blog_posts
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status, published_at DESC);
CREATE TRIGGER trg_blog_posts_updated BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SYSTEM HEALTH CHECKS
CREATE TABLE public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read system health" ON public.system_health_checks
  FOR SELECT TO authenticated USING (is_admin_user());
CREATE POLICY "Admins write system health" ON public.system_health_checks
  FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE INDEX idx_health_checks_service ON public.system_health_checks(service_name, checked_at DESC);
