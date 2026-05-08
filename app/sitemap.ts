import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tristarpickleball.com";

// Static, always-public routes. Anything that requires auth (or that
// only exists per-user, like /dashboard or /play) is intentionally
// excluded — Google can't crawl behind the login wall and shouldn't try.
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/login", priority: 0.3, changeFrequency: "yearly" },
  { path: "/register", priority: 0.6, changeFrequency: "yearly" },
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${appUrl}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Public group + tournament URLs — both render meaningful content
  // for unauthenticated viewers, so they belong in the sitemap.
  // Service client bypasses RLS for the read; we only emit URLs for
  // active/non-hidden rows so we don't surface deleted or stealth ones.
  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createServiceClient();
    const [groupsRes, tournamentsRes] = await Promise.all([
      supabase
        .from("shootout_groups")
        .select("slug, updated_at")
        .eq("is_active", true)
        .not("slug", "is", null),
      supabase
        .from("tournaments")
        .select("id, updated_at, status")
        .or("is_hidden.is.null,is_hidden.eq.false")
        .neq("status", "cancelled"),
    ]);

    const groupEntries: MetadataRoute.Sitemap = (groupsRes.data ?? []).map(
      (g: { slug: string; updated_at: string | null }) => ({
        url: `${appUrl}/groups/${g.slug}`,
        lastModified: g.updated_at ? new Date(g.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    );

    const tournamentEntries: MetadataRoute.Sitemap = (tournamentsRes.data ?? []).map(
      (t: { id: string; updated_at: string | null }) => ({
        url: `${appUrl}/tournaments/${t.id}`,
        lastModified: t.updated_at ? new Date(t.updated_at) : now,
        changeFrequency: "daily",
        priority: 0.7,
      })
    );

    dynamicEntries = [...groupEntries, ...tournamentEntries];
  } catch (e) {
    // Sitemap should never fail the build. If the DB query throws
    // (e.g. service-role key missing in a preview env), fall back to
    // just the static routes — Google will still get the core pages.
    console.error("sitemap: dynamic URL fetch failed:", e);
  }

  return [...staticEntries, ...dynamicEntries];
}
