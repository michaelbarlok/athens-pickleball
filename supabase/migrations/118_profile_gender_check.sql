-- Lock in gender as a hard invariant for real members.
--
-- Strict NOT NULL would require backfilling every inactive/test row
-- (~253 of them), which we don't have ground-truth for. A scoped
-- CHECK gives the same protection where it matters: every active
-- non-test profile must have a gender. Inactive and test rows stay
-- nullable so we don't have to invent data for accounts that won't
-- ever register for a gendered division.
--
-- New active sign-ups always land with gender via the register form
-- (ensureProfile + user_metadata), so the invariant holds going
-- forward.

ALTER TABLE profiles
  ADD CONSTRAINT profiles_active_real_members_have_gender
  CHECK (
    gender IS NOT NULL
    OR is_active = false
    OR is_test = true
  );

NOTIFY pgrst, 'reload schema';
