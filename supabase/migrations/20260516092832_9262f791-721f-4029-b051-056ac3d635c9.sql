
CREATE TYPE public.discount_status AS ENUM ('pending', 'approved', 'rejected', 'failed');

CREATE TABLE public.discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric NOT NULL,
  usage_limit_type text NOT NULL,
  usage_amount integer,
  renewal_limit_type text NOT NULL,
  renewals_count integer,
  expires_at timestamptz,
  applies_to text NOT NULL,
  membership_ids integer[] NOT NULL DEFAULT '{}',
  membership_names text[] NOT NULL DEFAULT '{}',
  associate_name text NOT NULL,
  location text NOT NULL,
  reason text NOT NULL,
  notes text,
  description text,
  requested_by text,
  status public.discount_status NOT NULL DEFAULT 'pending',
  approve_token uuid NOT NULL DEFAULT gen_random_uuid(),
  reject_token uuid NOT NULL DEFAULT gen_random_uuid(),
  momence_response jsonb,
  error_message text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discount_requests_status ON public.discount_requests(status);
CREATE INDEX idx_discount_requests_created ON public.discount_requests(created_at DESC);
CREATE UNIQUE INDEX idx_discount_requests_approve_token ON public.discount_requests(approve_token);
CREATE UNIQUE INDEX idx_discount_requests_reject_token ON public.discount_requests(reject_token);

ALTER TABLE public.discount_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view requests" ON public.discount_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can create requests" ON public.discount_requests FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_discount_requests_updated_at
  BEFORE UPDATE ON public.discount_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
