import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardBody, CardFooter, CardBadge, Chip } from "@/components/card-primitives";

export const dynamic = "force-dynamic";

/**
 * Public clubs list. RLS filters this automatically: anonymous /
 * non-member viewers see only public clubs; private clubs are only
 * visible to their members and site admins. No app-layer filter
 * needed — the SELECT just respects the policy on the clubs table.
 *
 * The "+ New Club" button is shown to any signed-in user — club
 * creation is open to everyone (the creator is auto-promoted to
 * club admin server-side). Logged-out viewers see no button.
 *
 * Card layout: standardized via components/card-primitives.tsx so
 * every list-card surface on the platform shares chrome, logo
 * sizing, badge tier, and accent stripe semantics. This is the
 * "proving ground" for the unified system — once it works here the
 * same pattern lands on sheet / group / tournament cards.
 */
export default async function ClubsListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Embedded counts give us member + group totals per club in a
  // single round-trip. PostgREST `(count)` respects RLS so private
  // clubs show 0 to non-members — but those clubs are filtered
  // out of the parent SELECT for non-members anyway by the clubs
  // RLS policy, so the counts are meaningful for every row that
  // makes it into the response.
  //
  // Cast through unknown: supabase-js's inferred type for SELECTs
  // that combine a column list with embedded `(count)` falls back
  // to GenericStringError, so accessing `c.city` etc. fails the
  // build. The runtime shape is the obvious one — we just need to
  // tell TypeScript what we know.
  type ClubRow = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    city: string | null;
    state: string | null;
    visibility: "public" | "private";
    logo_url: string | null;
    members: { count: number }[] | null;
    groups: { count: number }[] | null;
  };
  const { data: clubsRaw } = await supabase
    .from("clubs")
    .select(
      "id, slug, name, description, city, state, visibility, logo_url, members:club_memberships(count), groups:shootout_groups(count)"
    )
    .eq("is_active", true)
    .order("name", { ascending: true });
  const clubs = (clubsRaw ?? []) as unknown as ClubRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clubs"
        actions={
          user ? (
            <Link href="/clubs/new" className="btn-primary">
              + New Club
            </Link>
          ) : null
        }
      />

      {clubs.length === 0 ? (
        <p className="card p-6 text-center text-sm text-surface-muted">
          No clubs to show yet.
          {user && (
            <>
              {" "}
              <Link href="/clubs/new" className="text-brand-400 hover:text-brand-300">
                Create the first one →
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clubs.map((c) => {
            const memberCount = c.members?.[0]?.count ?? 0;
            const groupCount = c.groups?.[0]?.count ?? 0;
            const cityState = [c.city, c.state].filter(Boolean).join(", ");
            return (
              <li key={c.id}>
                <Card
                  href={`/clubs/${c.slug}`}
                  accent="brand"
                  ariaLabel={`Open ${c.name} club`}
                  className="h-full"
                >
                  <CardHeader
                    logo={c.logo_url ?? null}
                    title={<span className="truncate block">{c.name}</span>}
                    badges={
                      c.visibility === "private" ? (
                        <CardBadge variant="info" tone="gray" size="xs">
                          Private
                        </CardBadge>
                      ) : null
                    }
                  />

                  {(cityState || c.description) && (
                    <CardBody>
                      {cityState && (
                        <p className="flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 shrink-0 text-brand-vivid" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="truncate">{cityState}</span>
                        </p>
                      )}
                      {c.description && (
                        <p className="text-xs text-dark-200 line-clamp-2">
                          {c.description}
                        </p>
                      )}
                    </CardBody>
                  )}

                  <CardFooter
                    left={
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <Chip>{memberCount} {memberCount === 1 ? "member" : "members"}</Chip>
                        <Chip>{groupCount} {groupCount === 1 ? "group" : "groups"}</Chip>
                      </div>
                    }
                  />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
