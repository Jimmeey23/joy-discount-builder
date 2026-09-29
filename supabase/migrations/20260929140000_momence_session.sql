-- One shared Momence session for the whole deployment.
--
-- Signing in costs an MFA code, and Momence rate-limits that endpoint hard.
-- Serverless instances each start cold, so without somewhere shared to keep the
-- session every request would sign in again and exhaust the limit. This table
-- holds the single live session plus the trusted-device cookie, which lets
-- later sign-ins skip MFA entirely.
CREATE TABLE IF NOT EXISTS public.momence_session (
  id text PRIMARY KEY DEFAULT 'default',
  cookie text NOT NULL,
  device_cookie text,
  signed_in_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT momence_session_single_row CHECK (id = 'default')
);

-- Holds credentials-derived state: service role only, never the anon key.
ALTER TABLE public.momence_session ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_momence_session_updated_at ON public.momence_session;
CREATE TRIGGER update_momence_session_updated_at
  BEFORE UPDATE ON public.momence_session
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
