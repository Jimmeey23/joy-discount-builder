ALTER TABLE public.stripe_payment_links
  ADD COLUMN IF NOT EXISTS momence_member_id text,
  ADD COLUMN IF NOT EXISTS momence_member_details jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS utm_parameters jsonb NOT NULL DEFAULT '{}';
