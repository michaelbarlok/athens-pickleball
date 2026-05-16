import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { JoinLeaveClubButtons } from "./join-leave-club-buttons";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}

/**
 * Public club detail page.
 *
 * Visibility:
 *   - Public club: visible to everyone (including signed-out viewers).
 *   - Private club: visible only to members / site admins via RLS,
 *     or to anyone holding a valid invite token (rendered the same
 *     as the public page but with a "Join with invite" CTA).
 *
 * The page deliberately surfaces constituent groups so a non-member
 * sees what they'd gain by joining — the whole point of the club
 * concept for monetization later.
 */
export default async function ClubDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { token } = await searchParams;
  const supabase = await createClient();

  let { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  // RLS will return null for a private club with no membership.
  // If a valid invite token was supplied, re-fetch via the service
  // client so we can show the page (and surface a Join CTA).
  let viaToken = false;
  if (!club && token) {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const service = await createServiceClient();
    const { data: tokenRow } = await service
      .from("club_invites")
      .select("club_id, club:clubs(*)")
      .eq("token", token)
      .maybeSingle();
    if (tokenRow && (tokenRow as any).club?.slug === slug) {
      club = (tokenRow as any).club;
      viaToken = true;
    }
  }

  if (!club || !club.is_active) notFound();

  // Current user
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id, role").eq("user_id", user.id).single()
    : { data: null };

  // Membership state
  let myMembership: { club_role: "admin" | "member" } | null = null;
  if (profile) {
    const { data } = await supabase
      .from("club_memberships")
      .select("club_role")
      .eq("club_id", club.id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    myMembership = data as any;
  }

  const isMember = !!myMembership;
  const isClubAdmin = myMembership?.club_role === "admin" || profile?.role === "admin";

  // Member count (visible to anyone — read policy lets non-private
  // counts through; for private clubs the count is gated to members
  // + admins by the RLS policy).
  const { count: memberCount } = await supabase
    .from("club_memberships")
    .select("profile_id", { count: "exact", head: true })
    .eq("club_id", club.id);

  // Attached groups — public clubs can show this list to anyone;
  // for private clubs, group visibility cascades through each
  // group's own RLS so non-members may see only the public ones.
  const { data: attachedGroups } = await supabase
    .from("shootout_groups")
    .select("id, name, slug, group_type, visibility, city, state")
    .eq("club_id", club.id)
    .eq("is_active", true)
    .order("name");

  // Tournaments hosted by this club. Hidden tournaments excluded.
  const { data: hostedTournaments } = await supabase
    .from("tournaments")
    .select("id, title, start_date, location, status, timezone, type")
    .eq("host_club_id", club.id)
    .eq("is_hidden", false)
    .in("status", ["draft", "registration_open", "registration_closed", "in_progress"])
    .order("start_date", { ascending: true })
    .limit(10);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="rounded-2xl bg-surface-raised ring-1 ring-surface-border overflow-hidden">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-4">
            {club.logo_url ? (
              <img
                src={club.logo_url}
                alt={club.name}
                className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-lg object-contain bg-surface-overlay p-1 ring-1 ring-surface-border"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-dark-100 break-words">{club.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={club.visibility === "private" ? "badge-gray" : "badge-green"}>
                  {club.visibility === "private" ? "Private" : "Public"}
                </span>
                {(club.city || club.state) && (
                  <span className="text-surface-muted">
                    {[club.city, club.state].filter(Boolean).join(", ")}
                  </span>
                )}
                <span className="text-surface-muted">
                  {memberCount ?? 0} member{(memberCount ?? 0) === 1 ? "" : "s"}
                </span>
                {isMember && <span className="badge-green">Member</span>}
                {isClubAdmin && <span className="badge-yellow">Admin</span>}
              </div>
            </div>
          </div>

          {club.description && (
            <p className="text-sm text-dark-200 whitespace-pre-wrap">{club.description}</p>
          )}

          <JoinLeaveClubButtons
            clubId={club.id}
            clubSlug={club.slug}
            visibility={club.visibility}
            isLoggedIn={!!user}
            isMember={isMember}
            isAdmin={isClubAdmin}
            inviteToken={viaToken ? token ?? null : null}
          />
        </div>
      </div>

      {/* Groups in this club */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-dark-100">Groups</h2>
        {(attachedGroups ?? []).length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(attachedGroups ?? []).map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.slug}`}
                  className="card block hover:ring-1 hover:ring-brand-500/30 transition-shadow"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-dark-100 truncate">{g.name}</p>
                    <span className={g.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
                      {g.group_type === "free_play" ? "Free Play" : "Ladder"}
                    </span>
                    {g.visibility === "private" && <span className="badge-gray text-[10px]">Private</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-surface-muted truncate">
                    {[g.city, g.state].filter(Boolean).join(", ") || "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-muted italic">No groups attached yet.</p>
        )}
      </section>

      {/* Tournaments hosted by this club */}
      {(hostedTournaments ?? []).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-dark-100">Tournaments</h2>
            {!isMember && <span className="badge-blue text-[10px]">Members only</span>}
          </div>
          <ul className="space-y-2">
            {(hostedTournaments ?? []).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="card block hover:ring-1 hover:ring-brand-500/30 transition-shadow"
                >
                  <p className="text-sm font-semibold text-dark-100 line-clamp-1">{t.title}</p>
                  <p className="mt-1 text-xs text-surface-muted">
                    {t.start_date ?? "TBD"}
                    {t.location ? ` · ${t.location}` : ""}
                    {t.status === "registration_open" && (
                      <span className="ml-2 badge-green text-[10px]">Registration Open</span>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
