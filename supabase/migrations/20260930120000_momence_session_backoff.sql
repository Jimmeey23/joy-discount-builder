-- Sign-in throttling state for the shared Momence session.
--
-- Momence rate-limits its login and MFA endpoints per account, and a TOTP
-- token is single-use within its 30s window. Serverless instances each sign in
-- independently, so without shared throttling state a burst of cold starts
-- spends several login attempts (and re-uses the same TOTP token) within
-- seconds, which is what trips the limit.
ALTER TABLE public.momence_session
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz,
  ADD COLUMN IF NOT EXISTS rate_limit_hits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_signin_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_totp_counter bigint;

-- The row now exists before a cookie does, so the session can be throttled
-- before the first successful sign-in.
ALTER TABLE public.momence_session ALTER COLUMN cookie DROP NOT NULL;
