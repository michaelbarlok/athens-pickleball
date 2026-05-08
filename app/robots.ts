import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tristarpickleball.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth-walled per-user surfaces don't render anything Google
        // can read anyway — disallow them so the crawl budget goes
        // toward indexable pages.
        disallow: ["/api/", "/auth/", "/dashboard", "/profile/", "/admin/"],
      },
    ],
    host: appUrl,
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
