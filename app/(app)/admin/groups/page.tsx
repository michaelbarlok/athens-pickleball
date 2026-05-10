import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { US_STATES } from "@/lib/us-states";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { GroupsTable, type GroupRow } from "./groups-table";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lower-snake-case slug from a free-text group name. Strips anything
 * outside [a-z0-9 -], collapses whitespace to single dashes, then
 * collapses runs of dashes. Pure derivation — collision-free uniqueness
 * is the resolveUniqueSlug helper's job.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Walk slug, slug-2, slug-3, ... until we find one that no other
 * shootout_groups row owns. Stops at 100 to avoid pathological loops
 * — if we ever hit that, something else is wrong upstream.
 *
 * `excludeId` lets the rename path keep its own slug if the new name
 * happens to derive to it.
 */
async function resolveUniqueSlug(
  supabase: SupabaseClient,
  base: string,
  excludeId?: string
): Promise<string> {
  for (let i = 1; i <= 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const query = supabase
      .from("shootout_groups")
      .select("id", { head: true, count: "exact" })
      .eq("slug", candidate);
    const { count } = excludeId
      ? await query.neq("id", excludeId)
      : await query;
    if ((count ?? 0) === 0) return candidate;
  }
  // Defensive fallback — append a short random suffix so the insert
  // can't fail with a duplicate-key error even in worst case.
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export default async function AdminGroupsPage() {
  const supabase = await createClient();

  // Fetch all groups with member counts and last session info
  const { data: groups } = await supabase
    .from("shootout_groups")
    .select("*, group_memberships(count)")
    .order("name", { ascending: true });

  // Fetch last session date per group
  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select("group_id, created_at")
    .order("created_at", { ascending: false });

  const lastSessionMap = new Map<string, string>();
  if (sessions) {
    for (const s of sessions) {
      if (!lastSessionMap.has(s.group_id)) {
        lastSessionMap.set(s.group_id, s.created_at);
      }
    }
  }

  // ============================================================
  // Server Actions
  // ============================================================

  async function createGroup(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const city = (formData.get("city") as string)?.trim() || null;
    const state = (formData.get("state") as string)?.trim() || null;
    if (!name?.trim()) return;

    const baseSlug = slugify(name);
    if (!baseSlug) return;

    const supabase = await createClient();
    const slug = await resolveUniqueSlug(supabase, baseSlug);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    const groupType = (formData.get("group_type") as string) || "ladder_league";
    const visibility = (formData.get("visibility") as string) || "public";
    const ladderType = (formData.get("ladder_type") as string) || "court_promotion";

    const { data: newGroup, error } = await supabase
      .from("shootout_groups")
      .insert({
        name: name.trim(),
        slug,
        city,
        state,
        created_by: profile.id,
        is_active: true,
        group_type: groupType,
        ladder_type: groupType === "ladder_league" ? ladderType : "court_promotion",
        visibility,
      })
      .select("id")
      .single();

    if (!error && newGroup && groupType === "ladder_league") {
      // Create default preferences (only for ladder league groups)
      await supabase.from("group_preferences").insert({
        group_id: newGroup.id,
        pct_window_sessions: 10,
        new_player_start_step: 5,
        min_step: 1,
        step_move_up: 1,
        step_move_down: 1,
        game_limit_4p: 3,
        game_limit_5p: 4,
        win_by_2: true,
      });
    }

    if (!error && newGroup) {
      // Automatically add the creator as a group admin
      await supabase.from("group_memberships").insert({
        group_id: newGroup.id,
        player_id: profile.id,
        current_step: 5,
        group_role: "admin",
      });
    }

    revalidatePath("/admin/groups");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const groupId = formData.get("groupId") as string;
    const currentActive = formData.get("currentActive") === "true";

    const supabase = await createClient();
    await supabase
      .from("shootout_groups")
      .update({ is_active: !currentActive })
      .eq("id", groupId);

    revalidatePath("/admin/groups");
  }

  async function renameGroup(formData: FormData) {
    "use server";

    const groupId = formData.get("groupId") as string;
    const newName = formData.get("newName") as string;
    if (!newName?.trim()) return;

    const baseSlug = slugify(newName);
    if (!baseSlug) return;

    const supabase = await createClient();
    const newSlug = await resolveUniqueSlug(supabase, baseSlug, groupId);
    await supabase
      .from("shootout_groups")
      .update({ name: newName.trim(), slug: newSlug })
      .eq("id", groupId);

    revalidatePath("/admin/groups");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Groups" }]} />
      <PageHeader
        eyebrow="Admin"
        title="Manage Groups"
        subtitle="Create and manage groups."
      />

      {/* Create Group */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Create New Group
        </h2>
        <form action={createGroup} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              name="name"
              placeholder="Group name (e.g. Monday Ladder)"
              required
              className="input flex-1"
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Create Group
            </button>
          </div>
          <p className="text-xs text-surface-muted">
            URL slug is auto-generated from the name. If a group already owns that
            slug, we&apos;ll append a number (e.g. <code className="text-dark-200">monday-ladder-2</code>).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              name="city"
              placeholder="City (e.g. Athens)"
              className="input"
            />
            <select name="state" className="input">
              <option value="">Select State</option>
              {US_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-dark-200">Type:</span>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="group_type" value="ladder_league" defaultChecked className="text-brand-600 focus:ring-brand-500" />
              Ladder League
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="group_type" value="free_play" className="text-brand-600 focus:ring-brand-500" />
              Free Play
            </label>
            <span className="text-sm font-medium text-dark-200 ml-4">Visibility:</span>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="visibility" value="public" defaultChecked className="text-brand-600 focus:ring-brand-500" />
              Public
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="visibility" value="private" className="text-brand-600 focus:ring-brand-500" />
              Private
            </label>
          </div>
          <div className="ladder-mode flex flex-wrap items-center gap-4 pt-1 border-t border-surface-border">
            <span className="text-sm font-medium text-dark-200">Ladder Mode:</span>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="ladder_type" value="court_promotion" defaultChecked className="mt-0.5 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm">
                <span className="font-medium text-dark-100">Court Promotion</span>
                <span className="text-surface-muted"> — 1st place moves up a court, last place moves down. Court assignments carry forward between sessions on the same sheet.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="ladder_type" value="dynamic_ranking" className="mt-0.5 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm">
                <span className="font-medium text-dark-100">Dynamic Ranking</span>
                <span className="text-surface-muted"> — After each session, steps and win % are recalculated for all players. The next session re-seeds everyone from scratch by updated rankings, ignoring which court they were on.</span>
              </span>
            </label>
          </div>
        </form>
      </div>

      {/* Groups Table */}
      <GroupsTable
        groups={(groups ?? []).map((g): GroupRow => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          group_type: g.group_type,
          visibility: g.visibility,
          is_active: g.is_active,
          city: g.city ?? null,
          state: g.state ?? null,
          memberCount:
            (g.group_memberships as unknown as { count: number }[])?.[0]?.count ?? 0,
          lastSession: lastSessionMap.get(g.id) ?? null,
        }))}
        toggleActive={toggleActive}
        renameGroup={renameGroup}
      />
    </div>
  );
}
