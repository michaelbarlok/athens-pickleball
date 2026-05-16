import { getAuthUser } from "@/lib/auth";

/**
 * Check if the current user can manage a club.
 * Returns { profile, supabase } when authorized, null otherwise.
 *
 * Three paths grant access:
 *   - global site admin
 *   - the club creator
 *   - an explicit club admin (`club_memberships.club_role = 'admin'`)
 *
 * Mirrors `getTournamentManager` so any future "club admin or
 * higher" endpoint can use it directly.
 */
export async function getClubManager(clubId: string) {
  const auth = await getAuthUser();
  if (!auth) return null;
  const { profile, supabase } = auth;

  if (profile.role === "admin") return { profile, supabase };

  const { data: club } = await supabase
    .from("clubs")
    .select("created_by")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return null;
  if (club.created_by === profile.id) return { profile, supabase };

  const { data: clubAdmin } = await supabase
    .from("club_memberships")
    .select("club_role")
    .eq("club_id", clubId)
    .eq("profile_id", profile.id)
    .eq("club_role", "admin")
    .maybeSingle();
  if (clubAdmin) return { profile, supabase };

  return null;
}

/**
 * Lightweight predicate for "is the given profile a club admin?"
 * Used from server components where you've already fetched the
 * profile id (no need to redo the supabase auth dance).
 */
export async function isClubAdmin(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  profileId: string,
  clubId: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin") return true;
  const { data } = await supabase
    .from("club_memberships")
    .select("club_role")
    .eq("club_id", clubId)
    .eq("profile_id", profileId)
    .eq("club_role", "admin")
    .maybeSingle();
  return !!data;
}
