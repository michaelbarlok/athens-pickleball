-- ============================================================
-- Migration 113: Email bounce tracking on profiles
--
-- Adds three columns so /api/webhooks/resend can flip a flag when
-- a user's email bounces 3+ times. The notify() helper consults the
-- flag and skips the email channel for bouncing addresses (push and
-- in-app notifications still work).
--
-- The flag auto-clears via trigger when the user updates their email
-- address — covers the common case of "user mistyped their email at
-- signup, then fixes it later." A site admin can also manually flip
-- the flag back via direct UPDATE if they verify the address by hand.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_bouncing       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_bounce_count   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_bounce_at       timestamptz;

-- Auto-reset bounce state whenever the user updates their email.
-- The signup-side typo case ("alice@gnail.com" → "alice@gmail.com")
-- is the common path; without this trigger they'd be stuck in
-- email_bouncing=true forever even after fixing the address.
CREATE OR REPLACE FUNCTION reset_email_bounce_state_on_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_bouncing       := false;
    NEW.email_bounce_count   := 0;
    NEW.last_bounce_at       := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_email_bounce_state_on_email_change ON profiles;
CREATE TRIGGER trg_reset_email_bounce_state_on_email_change
BEFORE UPDATE OF email ON profiles
FOR EACH ROW EXECUTE FUNCTION reset_email_bounce_state_on_email_change();

NOTIFY pgrst, 'reload schema';
