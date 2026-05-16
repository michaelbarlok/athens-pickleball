import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/breadcrumb";

/**
 * Site-admin clubs list. Mirrors /admin/groups in role-gating + look.
 * Group admins manage their own club via /clubs/[slug]/manage; this
 * page is exclusively for the global site admin role.
 */
export default async function AdminClubsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/clubs");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, slug, name, visibility, is_active, city, state, logo_url, created_at")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Clubs" }]} />
      <PageHeader
        eyebrow="Admin"
        title="Clubs"
        actions={
          <Link href="/admin/clubs/new" className="btn-primary">
            + New Club
          </Link>
        }
      />

      {(clubs ?? []).length === 0 ? (
        <p className="card p-6 text-center text-sm text-surface-muted">
          No clubs yet. Create one to group existing leagues under a single umbrella.
        </p>
      ) : (
        <ul className="space-y-2">
          {(clubs ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/clubs/${c.id}`}
                className="card block hover:ring-1 hover:ring-brand-500/30 transition-shadow"
              >
                <div className="flex items-center gap-3">
                  {c.logo_url ? (
                    <img
                      src={c.logo_url}
                      alt=""
                      className="h-10 w-10 rounded object-contain bg-surface-overlay"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-surface-overlay" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-dark-100 truncate">{c.name}</p>
                      <span className={c.visibility === "private" ? "badge-gray" : "badge-green"}>
                        {c.visibility === "private" ? "Private" : "Public"}
                      </span>
                      {!c.is_active && <span className="badge-yellow">Inactive</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-surface-muted truncate">
                      {[c.city, c.state].filter(Boolean).join(", ") || "—"} · /clubs/{c.slug}
                    </p>
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
