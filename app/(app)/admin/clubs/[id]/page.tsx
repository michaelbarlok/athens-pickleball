import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { AdminClubManageClient } from "./admin-club-manage-client";
import { ClubEventsManager } from "./club-events-manager";
import { SendClubAnnouncement } from "./send-club-announcement";
import type { ClubEvent } from "@/types/database";

/**
 * Club management. Accessible to site admins AND club admins (the
 * URL lives under /admin/ historically — feel free to move later).
 * Group admins of constituent groups CANNOT manage the club from
 * here; they manage their own group's settings via /admin/groups.
 */
export default async function AdminClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/clubs/${id}`);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/dashboard");

  // Permission: site admin OR club admin. Anything else gets bounced
  // back to the public club page (or dashboard if no slug yet).
  const isSiteAdmin = profile.role === "admin";
  let canManage = isSiteAdmin;
  if (!canManage) {
    const { data: clubAdmin } = await supabase
      .from("club_memberships")
      .select("club_role")
      .eq("club_id", id)
      .eq("profile_id", profile.id)
      .eq("club_role", "admin")
      .maybeSingle();
    canManage = !!clubAdmin;
  }
  if (!canManage) {
    // Send them to the public club page if it exists.
    const { data: clubLookup } = await supabase
      .from("clubs")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
    redirect(clubLookup ? `/clubs/${clubLookup.slug}` : "/dashboard");
  }

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!club) notFound();

  // All members + their profile join, sorted admins-first.
  const { data: members } = await supabase
    .from("club_memberships")
    .select("club_role, joined_at, profile:profiles!profile_id(id, display_name, email, avatar_url)")
    .eq("club_id", id);
  const sortedMembers = (members ?? []).sort((a: any, b: any) => {
    if (a.club_role === b.club_role) {
      return (a.profile?.display_name ?? "").localeCompare(b.profile?.display_name ?? "");
    }
    return a.club_role === "admin" ? -1 : 1;
  });

  // Events (upcoming first via the manager component's local split).
  const { data: events } = await supabase
    .from("club_events")
    .select("*")
    .eq("club_id", id)
    .order("event_at", { ascending: false });

  // Groups currently attached + a roster of unattached groups for the
  // assign-existing-group picker.
  const [attachedRes, unattachedRes] = await Promise.all([
    supabase
      .from("shootout_groups")
      .select("id, name, slug, group_type, visibility, is_active")
      .eq("club_id", id)
      .order("name"),
    supabase
      .from("shootout_groups")
      .select("id, name, group_type, city, state")
      .is("club_id", null)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Admin" },
          { label: "Clubs", href: "/admin/clubs" },
          { label: club.name },
        ]}
      />
      <PageHeader
        eyebrow="Admin"
        title={club.name}
        actions={
          <Link href={`/clubs/${club.slug}`} className="btn-secondary text-sm">
            View public page →
          </Link>
        }
      />

      <AdminClubManageClient
        club={club}
        members={sortedMembers as any}
        attachedGroups={attachedRes.data ?? []}
        unattachedGroups={unattachedRes.data ?? []}
        canDeleteClub={isSiteAdmin}
      />

      <ClubEventsManager clubId={id} events={(events ?? []) as ClubEvent[]} />

      <SendClubAnnouncement clubId={id} memberCount={sortedMembers.length} />
    </div>
  );
}
