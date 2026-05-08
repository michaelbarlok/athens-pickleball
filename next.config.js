/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Google OAuth profile photos. ~20 users sign in with Google and
      // their auto-imported avatar_url points here; without this entry
      // next/image refuses to render and the avatar shows a broken-
      // image placeholder instead of the photo.
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  // Security headers applied to all routes
  async headers() {
    return [
      {
        // Serve the web app manifest with the correct MIME type so Chrome
        // recognises it as a PWA manifest rather than plain JSON.
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Camera + microphone stay locked down (we don't use them).
            // Geolocation is opened to first-party only (`self`) so the
            // "Find near me" search on the groups + tournaments listings
            // can prompt the user. Without this it gets silently blocked
            // by the policy and never asks — the user just sees a dead
            // button click.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
