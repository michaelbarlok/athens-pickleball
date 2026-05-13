import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin-scope resolver for the `/admin/*` list pages.
 *
 * Two flavors of admin can land on these pages:
 *
 *   - **Site admin** (`profiles.role = 'admin'`): owns the whole
 *     platform. Sees every group, every session, every sheet,
 *     every tournament. Returned as `{ siteAdmin: true }`.
 *
 *   - **Group admin** (`group_memberships.group_role = 'admin'` for
 *     at least one group): owns those groups only. Returned as
 *     `{ siteAdmin: false, groupIds: [...] }` so the caller can
 *     scope its query with `.in('group_id', groupIds)` or
 *     `.in('id', groupIds)` on shootout_groups.
 *
 * If neither — the caller is unauthorized to view the admin list.
 * Returns `null` and the page should redirect / 404.
 *
 * Group admins shouldn't see other groups' sessions, sheets, or
 * tournaments in their admin dashboards. The old queries fetched
 * everything globally, which leaked roster sizes and event details
 * across groups even though the action buttons would have been
 * blocked at the RLS layer.
 */
export type AdminScope =
  | { siteAdmin: true; profileId: string }
  | { siteAdmin: false; profileId: string; groupIds: string[] }
  | null;

export async function getAdminScope(
  supabase: SupabaseClient
): Promise<AdminScope> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;

  if (profile.role === "admin") {
    return { siteAdmin: true, profileId: profile.id };
  }

  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("player_id", profile.id)
    .eq("group_role", "admin");
  const groupIds = (memberships ?? []).map((m) => m.group_id);
  if (groupIds.length === 0) return null;
  return { siteAdmin: false, profileId: profile.id, groupIds };
}
