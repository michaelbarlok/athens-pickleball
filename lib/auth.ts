import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type AuthResult = {
  user: { id: string };
  profile: { id: string; role: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Get authenticated user and their profile.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return null;

  return { user, profile, supabase };
}

/**
 * Require authenticated user, returning 401 response if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return auth;
}

/**
 * Require admin role, returning 403 if not admin.
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

/**
 * Check if user is admin of a specific group.
 *
 * Three paths grant true:
 *   1. global site admin (`profiles.role = 'admin'`)
 *   2. explicit group admin (`group_memberships.group_role = 'admin'`)
 *   3. admin of the group's parent CLUB (if the group has one) — read
 *      from `shootout_groups.club_id` + `club_memberships.club_role
 *      = 'admin'`. This is the "club admins inherit full group admin
 *      rights" rule, done at read time. No phantom group_memberships
 *      rows are written; the inherited admin never appears in the
 *      group's roster.
 *
 * Two cheap lookups: the explicit-admin check (1 row) and the
 * club-inheritance check (1 row each on shootout_groups + club_
 * memberships). Skipped entirely when the group has no parent club.
 */
export async function isGroupAdmin(
  supabase: AuthResult["supabase"],
  profileId: string,
  groupId: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin") return true;
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("group_role")
    .eq("group_id", groupId)
    .eq("player_id", profileId)
    .maybeSingle();
  if (membership?.group_role === "admin") return true;

  // Club-admin inheritance. One indirection (group → club) + one
  // role check; skipped entirely for standalone groups.
  const { data: group } = await supabase
    .from("shootout_groups")
    .select("club_id")
    .eq("id", groupId)
    .maybeSingle();
  const clubId = group?.club_id;
  if (!clubId) return false;
  const { data: clubAdmin } = await supabase
    .from("club_memberships")
    .select("club_role")
    .eq("club_id", clubId)
    .eq("profile_id", profileId)
    .eq("club_role", "admin")
    .maybeSingle();
  return !!clubAdmin;
}
