import { createClient } from "@/lib/supabase/server";
import type {
  ShootoutGroup,
  GroupPreferences,
  GroupMembership,
  Profile,
} from "@/types/database";
import { EmptyState } from "@/components/empty-state";
import { AdminGroupClient } from "./admin-group-client";

// Re-exported types so the client component can stay free of cross-
// file type plumbing. The shapes here mirror the SELECT clauses
// below and the original page's local interfaces.
export interface MemberRow extends Omit<GroupMembership, "player"> {
  player: Pick<
    Profile,
    "id" | "full_name" | "display_name" | "avatar_url" | "email"
  >;
}

export interface PendingMember {
  id: string;
  name: string;
  step: number | null;
  win_pct: number | null;
  total_sessions: number | null;
  last_played_at: string | null;
  invite_email: string | null;
}

export type Tab = "members" | "preferences" | "schedule";

/**
 * Server-component shell for the group admin detail page.
 *
 * Used to be a 1,390-line `"use client"` page that fetched its data
 * from a `useEffect`-on-mount fan-out. The client work is now
 * isolated in `<AdminGroupClient>` and the five data queries run on
 * the server, so:
 *
 *   1. First paint shows real content instead of a loading spinner —
 *      no extra round trip after the route loads.
 *   2. Every subsequent mutation can use `router.refresh()` to
 *      re-run these queries server-side and re-hydrate the client
 *      with fresh props.
 *   3. The existing realtime subscription stays in the client and
 *      also calls `router.refresh()` on group_memberships changes.
 *
 * No behavior changes — every interactive flow, every handler,
 * every JSX block is preserved verbatim in admin-group-client.tsx.
 */
export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialTab: Tab =
    sp.tab === "preferences" ? "preferences" : "members";

  const supabase = await createClient();

  // Same parallel fetch shape the client useEffect used to run; just
  // moved to the server so the data is in props on first paint.
  const [groupRes, prefsRes, membersRes, playersRes, pendingRes] =
    await Promise.all([
      supabase.from("shootout_groups").select("*").eq("id", id).single(),
      supabase.from("group_preferences").select("*").eq("group_id", id).single(),
      supabase
        .from("group_memberships")
        .select(
          "*, player:profiles!group_memberships_player_id_fkey(id, full_name, display_name, avatar_url, email)"
        )
        .eq("group_id", id)
        .order("current_step", { ascending: true })
        .order("win_pct", { ascending: false }),
      supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
      supabase
        .from("pending_group_members")
        .select(
          "id, name, step, win_pct, total_sessions, last_played_at, invite_email"
        )
        .eq("group_id", id)
        .is("claimed_by", null)
        .order("name", { ascending: true }),
    ]);

  // Group-not-found render path matches the prior page exactly: a
  // friendly EmptyState card with a back-link, not a 404.
  if (!groupRes.data) {
    return (
      <EmptyState
        title="Group not found"
        description="The group you're looking for doesn't exist or has been removed."
        actionLabel="Back to groups"
        actionHref="/admin/groups"
      />
    );
  }

  return (
    <AdminGroupClient
      groupId={id}
      initialTab={initialTab}
      initialGroup={groupRes.data as ShootoutGroup}
      initialPreferences={(prefsRes.data ?? null) as GroupPreferences | null}
      initialMembers={(membersRes.data ?? []) as MemberRow[]}
      initialAllPlayers={(playersRes.data ?? []) as Profile[]}
      initialPendingMembers={(pendingRes.data ?? []) as PendingMember[]}
    />
  );
}
