-- public.stripe_payment_links is owned by a different application in this
-- Supabase project (created_by uuid NOT NULL -> auth.users, plus its own
-- name/amount/url/clicks columns). This app's columns had been ALTERed on top
-- of it, and its inserts could never satisfy that FK because this app has no
-- authenticated users.
--
-- This gives the approval workflow its own table. The shared table is left
-- untouched.
CREATE TABLE IF NOT EXISTS public.payment_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe objects, populated on approval
  stripe_payment_link_id text UNIQUE,
  stripe_payment_link_url text,
  stripe_price_id text NOT NULL,
  stripe_product_id text,
  stripe_response jsonb,
  last_event jsonb,

  -- what is being sold
  product_name text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]',
  currency text NOT NULL DEFAULT 'inr',
  unit_amount integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  requested_amount integer NOT NULL DEFAULT 0,

  -- discount
  promotion_code_id text,
  promotion_code text,
  promotion_code_snapshot jsonb,
  custom_promo_type text,
  custom_promo_value numeric,
  custom_coupon_id text,
  custom_promotion_code_id text,
  allow_promotion_codes boolean NOT NULL DEFAULT false,

  -- customer
  customer_email text,
  customer_name text,
  customer_phone text,
  momence_member_id text,
  momence_member_details jsonb,
  collect_address boolean NOT NULL DEFAULT false,
  collect_phone boolean NOT NULL DEFAULT false,

  -- link behaviour
  single_use boolean NOT NULL DEFAULT false,
  adjustable_quantity boolean NOT NULL DEFAULT false,
  max_redemptions integer,
  link_expires_at timestamptz,
  after_completion_type text NOT NULL DEFAULT 'redirect',
  after_completion_message text,
  after_completion_redirect_url text,
  custom_fields jsonb NOT NULL DEFAULT '[]',
  utm_parameters jsonb NOT NULL DEFAULT '{}',

  -- internal context
  description text,
  internal_note text,
  purpose text,
  created_by text,

  -- approval workflow
  status public.payment_link_status NOT NULL DEFAULT 'pending',
  approve_token uuid NOT NULL DEFAULT gen_random_uuid(),
  reject_token uuid NOT NULL DEFAULT gen_random_uuid(),
  approved_at timestamptz,
  error_message text,

  -- payment tracking, written by the Stripe webhook
  payment_count integer NOT NULL DEFAULT 0,
  total_paid_amount integer NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  checkout_session_ids text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_link_requests_after_completion_type_check
    CHECK (after_completion_type IN ('redirect', 'message'))
);

CREATE INDEX IF NOT EXISTS idx_payment_link_requests_status
  ON public.payment_link_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_link_requests_created
  ON public.payment_link_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_link_requests_payment_link_id
  ON public.payment_link_requests(stripe_payment_link_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_link_requests_approve_token
  ON public.payment_link_requests(approve_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_link_requests_reject_token
  ON public.payment_link_requests(reject_token);

ALTER TABLE public.payment_link_requests ENABLE ROW LEVEL SECURITY;

-- Reads go through the service role in server functions; the approve/reject
-- tokens are the only public entry point and they are checked server side.
DROP POLICY IF EXISTS "Anyone can view payment link requests" ON public.payment_link_requests;
CREATE POLICY "Anyone can view payment link requests"
  ON public.payment_link_requests FOR SELECT USING (true);

DROP TRIGGER IF EXISTS update_payment_link_requests_updated_at ON public.payment_link_requests;
CREATE TRIGGER update_payment_link_requests_updated_at
  BEFORE UPDATE ON public.payment_link_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
