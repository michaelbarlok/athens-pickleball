import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * Public clubs list. RLS filters this automatically: anonymous /
 * non-member viewers see only public clubs; private clubs are only
 * visible to their members and site admins. No app-layer filter
 * needed — the SELECT just respects the policy on the clubs table.
 */
export default async function ClubsListPage() {
  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, slug, name, description, city, state, visibility, logo_url")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Clubs" />

      {(clubs ?? []).length === 0 ? (
        <p className="card p-6 text-center text-sm text-surface-muted">
          No clubs to show yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(clubs ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/clubs/${c.slug}`}
                className="card block h-full hover:ring-1 hover:ring-brand-500/30 transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {c.logo_url ? (
                    <img
                      src={c.logo_url}
                      alt=""
                      className="h-12 w-12 rounded object-contain bg-surface-overlay shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-surface-overlay shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-dark-100 truncate">{c.name}</p>
                      {c.visibility === "private" && <span className="badge-gray text-[10px]">Private</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-surface-muted truncate">
                      {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                    </p>
                    {c.description && (
                      <p className="mt-2 text-xs text-dark-200 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
