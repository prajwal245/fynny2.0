-- Create waitlist table
CREATE TABLE public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_type TEXT NOT NULL,
  company_size TEXT NOT NULL,
  location TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_converted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_email ON public.waitlist(email);
CREATE INDEX idx_waitlist_position ON public.waitlist(position);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (anonymous) can insert into waitlist (signup form)
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Anyone can check if an email exists (for duplicate check) — only return email column via app logic
CREATE POLICY "Anyone can check waitlist count and email existence"
ON public.waitlist
FOR SELECT
TO anon, authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_waitlist_updated_at
BEFORE UPDATE ON public.waitlist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();