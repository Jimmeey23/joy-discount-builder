CREATE TYPE public.payment_link_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'created',
  'paid',
  'inactive',
  'failed'
);

CREATE TABLE public.stripe_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_link_id text UNIQUE,
  stripe_payment_link_url text,
  stripe_price_id text NOT NULL,
  stripe_product_id text,
  product_name text NOT NULL,
  currency text NOT NULL,
  unit_amount integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  requested_amount integer NOT NULL,
  promotion_code_id text,
  promotion_code text,
  custom_promo_type text,
  custom_promo_value numeric,
  custom_coupon_id text,
  custom_promotion_code_id text,
  customer_email text,
  customer_name text,
  purpose text,
  created_by text,
  status public.payment_link_status NOT NULL DEFAULT 'pending',
  approve_token uuid NOT NULL DEFAULT gen_random_uuid(),
  reject_token uuid NOT NULL DEFAULT gen_random_uuid(),
  approved_at timestamptz,
  payment_count integer NOT NULL DEFAULT 0,
  total_paid_amount integer NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  checkout_session_ids text[] NOT NULL DEFAULT '{}',
  stripe_response jsonb,
  last_event jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_payment_links_status ON public.stripe_payment_links(status);
CREATE INDEX idx_stripe_payment_links_created ON public.stripe_payment_links(created_at DESC);
CREATE INDEX idx_stripe_payment_links_payment_link_id ON public.stripe_payment_links(stripe_payment_link_id);
CREATE UNIQUE INDEX idx_stripe_payment_links_approve_token ON public.stripe_payment_links(approve_token);
CREATE UNIQUE INDEX idx_stripe_payment_links_reject_token ON public.stripe_payment_links(reject_token);

ALTER TABLE public.stripe_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stripe payment links"
  ON public.stripe_payment_links FOR SELECT USING (true);

CREATE TRIGGER update_stripe_payment_links_updated_at
  BEFORE UPDATE ON public.stripe_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
