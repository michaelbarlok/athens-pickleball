import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LandingFooter } from "./landing-footer";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tristarpickleball.com";

export const metadata: Metadata = {
  // Canonical only on the landing page itself — search engines
  // collapse www/non-www and trailing-slash variants here. Setting
  // this at the root layout would force EVERY page to canonical to
  // /, which is wrong for product/group/tournament URLs.
  alternates: { canonical: "/" },
};

// FAQ entries. Single source of truth for both the visible accordion
// below and the FAQPage JSON-LD that lets Google show these Q&As as
// "rich result" expandable snippets directly under the search listing.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Do I need to be invited or can anyone join?",
    a: "Anyone can create an account. To join a specific group or ladder league, you request access and the group organizer approves you.",
  },
  {
    q: "What formats does Tri-Star Pickleball support?",
    a: "Tri-Star Pickleball supports ladder leagues with step-based rankings, free play sessions with automatic team rotation, and Round Robin tournaments with seeded playoff brackets.",
  },
  {
    q: "Can I run my own group?",
    a: "Yes. Organizers can create groups, configure ladder settings, manage sign-up sheets, and run sessions directly from the platform.",
  },
  {
    q: "What happens if a session has an odd number of players?",
    a: "Free Play handles it automatically — it rotates players fairly so everyone gets balanced game time, no matter how many people show up.",
  },
];

// Live community counts shown in the hero. Cached for an hour so a
// flood of bots / scraper hits doesn't fire three SELECTs every
// render. If the DB is unreachable we fall back to nulls and the
// strip just renders the labels with em-dashes — never blocks the
// page from loading.
const getLandingStats = unstable_cache(
  async () => {
    try {
      const supabase = await createServiceClient();
      const [players, groups, fpMatches, ladderMatches] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .or("is_test.is.null,is_test.eq.false"),
        supabase
          .from("shootout_groups")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase
          .from("free_play_matches")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("game_results")
          .select("id", { count: "exact", head: true }),
      ]);
      // Surface count errors so a silent RLS / network failure isn't
      // hidden behind the em-dash forever (cache TTL 1h). Each line
      // logs its own table so the wrong one is obvious in Vercel logs.
      if (players.error) console.error("[landing-stats] profiles count failed:", players.error.message);
      if (groups.error) console.error("[landing-stats] shootout_groups count failed:", groups.error.message);
      if (fpMatches.error) console.error("[landing-stats] free_play_matches count failed:", fpMatches.error.message);
      if (ladderMatches.error) console.error("[landing-stats] game_results count failed:", ladderMatches.error.message);

      // Sum the two game tables. We deliberately drop the previous
      // `|| null` here: a real "0 + 0" should show as a low-end social
      // proof number ("5+"), not "—". The dash is reserved for the
      // hard-failure path in the catch block below.
      const fp = fpMatches.count ?? 0;
      const ld = ladderMatches.count ?? 0;
      return {
        players: players.count ?? null,
        groups: groups.count ?? null,
        games: fp + ld,
      };
    } catch {
      return { players: null, groups: null, games: null };
    }
  },
  ["landing-stats"],
  { revalidate: 3600 }
);

// Floor each count to the nearest "nice" magnitude and append "+", so
// the strip reads as honest approximate social proof rather than a
// precision claim. 6 → "5+", 105 → "100+", 177 → "150+", 4827 → "4k+".
// Bucket size grows with the count so the number keeps useful signal
// as the platform scales.
function formatStat(n: number | null): string {
  if (n === null) return "—";
  if (n < 10) return "5+";
  if (n < 50) return "10+";
  if (n < 100) return "50+";
  if (n < 500) return `${Math.floor(n / 50) * 50}+`;
  if (n < 1000) return `${Math.floor(n / 100) * 100}+`;
  return `${Math.floor(n / 1000)}k+`;
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users have no business looking at the marketing pitch —
  // send them straight to the dashboard. Lets the public landing be
  // tuned aggressively for SEO/conversion without surprising members.
  if (user) redirect("/dashboard");

  const stats = await getLandingStats();

  // JSON-LD schemas: Organization (logo + contact), WebSite (canonical
  // URL + name), and FAQPage (drives rich-result accordions in Google).
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tri-Star Pickleball",
    legalName: "Tri-Star Pickleball, LLC",
    foundingDate: "2026",
    url: appUrl,
    logo: `${appUrl}/icon.png`,
    description:
      "Pickleball ladder league, free play, and tournament platform for community groups.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Athens",
      addressRegion: "TN",
      addressCountry: "US",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: "info@tristarpickleball.com",
        contactType: "customer support",
      },
    ],
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tri-Star Pickleball",
    url: appUrl,
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-10">
      {/* JSON-LD structured data — picked up by Google for the
          knowledge graph (Organization), site links (WebSite), and
          rich-result FAQ accordions (FAQPage). One <script> per
          schema is the canonical pattern. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl">
        {/* Layered gradient backdrop — keeps the hero grounded without heavy imagery */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-brand-700/30 via-brand-600/15 to-surface-raised"
        />
        <div
          aria-hidden
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl"
        />
        <div className="relative px-6 py-16 sm:px-10 sm:py-20 text-center space-y-6">
          <Logo className="mx-auto h-24 w-auto sm:h-32" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-dark-950/40 ring-1 ring-surface-border px-3 py-1 text-xs font-medium text-brand-vivid">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            Built for ladder leagues, free play & tournaments
          </span>
          <h1 className="text-3xl font-bold text-dark-100 sm:text-5xl tracking-tight">
            Run your pickleball league<br className="hidden sm:block" /> without the spreadsheets.
          </h1>
          <p className="max-w-2xl mx-auto text-base text-dark-200 sm:text-lg leading-relaxed">
            Sign-ups, scores, live rankings, and court tracking — all in one
            place. Built in East Tennessee for ladder leagues, free-play groups,
            and Round Robin tournaments across the Southeast.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/register" className="btn-primary btn-lg">
              Get Started
            </Link>
            <Link href="#features" className="btn-secondary btn-lg">
              See how it works
            </Link>
          </div>

          {/* Live community counters — pulled from the DB once an
              hour and cached. Three numbers grounds the page in
              "this is a real product, real users." Falls back to em-
              dashes if the count fetch fails so the strip never
              breaks the layout. */}
          <dl className="mx-auto grid max-w-xl grid-cols-3 gap-2 pt-6 sm:gap-6">
            <div className="rounded-xl bg-dark-950/40 ring-1 ring-surface-border px-3 py-3 sm:py-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">
                Active Players
              </dt>
              <dd className="mt-1 text-xl sm:text-2xl font-bold text-dark-100">
                {formatStat(stats.players)}
              </dd>
            </div>
            <div className="rounded-xl bg-dark-950/40 ring-1 ring-surface-border px-3 py-3 sm:py-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">
                Groups
              </dt>
              <dd className="mt-1 text-xl sm:text-2xl font-bold text-dark-100">
                {formatStat(stats.groups)}
              </dd>
            </div>
            <div className="rounded-xl bg-dark-950/40 ring-1 ring-surface-border px-3 py-3 sm:py-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">
                Games Tracked
              </dt>
              <dd className="mt-1 text-xl sm:text-2xl font-bold text-dark-100">
                {formatStat(stats.games)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-4xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-vivid">
            Getting started
          </p>
          <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl tracking-tight">Up and running in minutes</h2>
          <p className="text-dark-300">No complicated setup. Sign up, join a group, and play.</p>
        </div>
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {/* Connector line — only on desktop, sits behind the step dots */}
          <div
            aria-hidden
            className="hidden sm:block absolute top-5 left-[16.666%] right-[16.666%] h-px bg-gradient-to-r from-brand-500/30 via-brand-500/60 to-brand-500/30"
          />
          {[
            {
              n: 1,
              title: "Create your account",
              body: "Sign up in seconds. Just your name and email.",
            },
            {
              n: 2,
              title: "Join a group",
              body: "Find your local ladder league or free play group and request to join. The organizer approves you and you're in.",
            },
            {
              n: 3,
              title: "Sign up & play",
              body: "Browse upcoming sessions, tap to sign up, show up and play. Scores and rankings update automatically.",
            },
          ].map((step) => (
            <div key={step.n} className="relative space-y-3">
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand-900/80 text-brand-300 font-bold text-lg ring-4 ring-dark-950">
                {step.n}
              </div>
              <h3 className="text-base font-semibold text-dark-100">{step.title}</h3>
              <p className="text-sm text-dark-300">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature Showcase ── */}
      <section id="features" className="space-y-12 max-w-4xl mx-auto scroll-mt-24">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl tracking-tight">
            Everything you need to run your pickleball community
          </h2>
          <p className="text-dark-300 max-w-2xl mx-auto">
            From casual shootouts to competitive tournaments — all managed in one place.
          </p>
        </div>

        {/* Signup Sheets */}
        <div id="signup-sheets" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-brand-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Sign-Up Sheets</h2>
            </div>
            <p className="text-dark-200">
              Browse upcoming events, sign up with one tap, and see exactly who&apos;s playing. Full? You&apos;ll be added to the waitlist and promoted automatically when a spot opens.
            </p>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Upcoming Events</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Thursday Ladder</p>
                  <p className="text-xs text-surface-muted">Mar 20 at Calhoun Courts</p>
                </div>
                <span className="badge-green">Open</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Saturday Ladder</p>
                  <p className="text-xs text-surface-muted">Mar 22 at Calhoun Courts</p>
                </div>
                <span className="badge-green">12/16</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Tuesday Night</p>
                  <p className="text-xs text-surface-muted">Mar 25 at Calhoun Courts</p>
                </div>
                <span className="badge-yellow">Waitlist</span>
              </div>
            </div>
          </div>
        </div>

        {/* Free Play */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Session Standings</p>
            </div>
            <div className="divide-y divide-surface-border">
              {[
                { rank: 1, name: "Alex M.", record: "4-1", diff: "+12", diffColor: "text-teal-300" },
                { rank: 2, name: "Jordan T.", record: "3-1", diff: "+8", diffColor: "text-teal-300" },
                { rank: 3, name: "Casey R.", record: "3-2", diff: "+3", diffColor: "text-teal-300" },
                { rank: 4, name: "Morgan D.", record: "2-3", diff: "-4", diffColor: "text-red-400" },
                { rank: 5, name: "Riley K.", record: "1-4", diff: "-9", diffColor: "text-red-400" },
              ].map((p) => (
                <div key={p.rank} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-surface-muted w-5 text-right">{p.rank}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                    {p.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-dark-100">{p.name}</span>
                  <span className="text-sm font-semibold text-dark-100">{p.record}</span>
                  <span className={`text-sm font-semibold w-10 text-right ${p.diffColor}`}>{p.diff}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Free Play</h2>
            </div>
            <p className="text-dark-200">
              Got 5 people? 9? 13? No problem. Free Play handles the hard part — shuffling teams, tracking who plays next, and keeping score so you don&apos;t have to. Just check in your group and start playing. Standings update live after every game.
            </p>
          </div>
        </div>

        {/* Rankings */}
        <div id="rankings" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Rankings</p>
            </div>
            <div className="divide-y divide-surface-border">
              {[
                { rank: 1, name: "Alex M.", step: 1, pct: "82.4%" },
                { rank: 2, name: "Jordan T.", step: 1, pct: "78.1%" },
                { rank: 3, name: "Casey R.", step: 2, pct: "75.9%" },
                { rank: 4, name: "Morgan D.", step: 2, pct: "71.3%" },
                { rank: 5, name: "Riley K.", step: 3, pct: "68.7%" },
              ].map((p) => (
                <div key={p.rank} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-surface-muted w-5 text-right">{p.rank}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium">
                    {p.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-dark-100">{p.name}</span>
                  <span className="inline-flex items-center rounded-md bg-brand-900/40 px-1.5 py-0.5 text-xs font-semibold text-brand-300">
                    Step {p.step}
                  </span>
                  <span className="text-sm text-dark-200 w-14 text-right">{p.pct}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .982-3.172M12 3.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Live Rankings</h2>
            </div>
            <p className="text-dark-200">
              Track your step and scoring percentage across sessions. The ranking system updates after every shootout — climb the ladder by winning games and earning points.
            </p>
          </div>
        </div>

        {/* Shootout Sessions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-accent-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Sessions</h2>
            </div>
            <p className="text-dark-200">
              Real-time tournament management from check-in to final scores. Get your court assignment, enter scores after each game, and watch the live standings update round by round.
            </p>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Your Court</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-brand-300">Court 2</span>
                <span className="badge-green">Round 3</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-overlay p-3 text-center">
                  <p className="text-xs text-surface-muted">Your Score</p>
                  <p className="text-2xl font-bold text-teal-300">11</p>
                </div>
                <div className="rounded-lg bg-surface-overlay p-3 text-center">
                  <p className="text-xs text-surface-muted">Opponent</p>
                  <p className="text-2xl font-bold text-dark-200">7</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-surface-muted">
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
                Live — 12 players across 3 courts
              </div>
            </div>
          </div>
        </div>

        {/* Tournaments */}
        <div id="tournaments" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Upcoming Tournaments</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Spring Doubles Classic</p>
                  <p className="text-xs text-surface-muted">Apr 12 &middot; Round Robin</p>
                </div>
                <span className="badge-green">Open</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Mixed 4.0 Ladder</p>
                  <p className="text-xs text-surface-muted">Apr 19 &middot; Round Robin</p>
                </div>
                <span className="badge-blue">16/32</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Summer Classic</p>
                  <p className="text-xs text-surface-muted">May 3 &middot; Round Robin</p>
                </div>
                <span className="badge-yellow">Coming Soon</span>
              </div>
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .982-3.172M12 3.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Tournaments</h2>
            </div>
            <p className="text-dark-200">
              Compete in organized tournaments with Round Robin pool play and seeded playoff brackets. Real-time court assignments, automatic push alerts when it&apos;s your turn, and a live view of every match.
            </p>
          </div>
        </div>

        {/* Groups & Community */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">Your Groups</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Thursday Ladder</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">Ladder</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>Step 2</span>
                  <span>72.5% Win</span>
                  <span>14 sessions</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Sunday Open Play</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-teal-400">Free Play</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>12-5 record</span>
                  <span>+18 pts</span>
                  <span>6 sessions</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Saturday Competitive</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">Ladder</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>Step 1</span>
                  <span>81.2% Win</span>
                  <span>8 sessions</span>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-brand-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Groups &amp; Community</h2>
            </div>
            <p className="text-dark-200">
              Join groups that match your schedule and play style — ladder leagues for competitive tracking, or free play groups for casual sessions. Track your stats per group and follow along with community discussions in the forum.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-vivid">
            Frequently asked
          </p>
          <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl tracking-tight">Answers before you sign up</h2>
        </div>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl bg-surface-raised ring-1 ring-surface-border transition-colors hover:ring-brand-500/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-dark-100">
                {item.q}
                <svg
                  className="h-4 w-4 shrink-0 text-surface-muted transition-transform group-open:rotate-180"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </summary>
              <p className="border-t border-surface-border px-4 py-3 text-sm text-dark-300 leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="pb-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700/40 via-brand-600/25 to-teal-600/20 ring-1 ring-surface-border">
          <div
            aria-hidden
            className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl"
          />
          <div className="relative px-6 py-12 sm:px-10 sm:py-14 text-center space-y-4">
            <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl">
              Ready to play?
            </h2>
            <p className="text-dark-200 max-w-md mx-auto">
              Join the community and start tracking your games — casual or competitive.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/register" className="btn-primary btn-lg">
                Create your account
              </Link>
              <Link href="/login" className="btn-secondary btn-lg">
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer (always visible, even for authenticated users) ── */}
      <LandingFooter />
    </div>
  );
}
