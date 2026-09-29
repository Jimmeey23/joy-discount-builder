-- Options exposed by the payment link generator that map directly onto
-- Stripe paymentLinks.create parameters.
ALTER TABLE public.stripe_payment_links
  ADD COLUMN IF NOT EXISTS link_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS after_completion_type text NOT NULL DEFAULT 'redirect',
  ADD COLUMN IF NOT EXISTS after_completion_message text,
  ADD COLUMN IF NOT EXISTS after_completion_redirect_url text,
  ADD COLUMN IF NOT EXISTS adjustable_quantity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotion_code_snapshot jsonb;

ALTER TABLE public.stripe_payment_links
  DROP CONSTRAINT IF EXISTS stripe_payment_links_after_completion_type_check;

ALTER TABLE public.stripe_payment_links
  ADD CONSTRAINT stripe_payment_links_after_completion_type_check
  CHECK (after_completion_type IN ('redirect', 'message'));
