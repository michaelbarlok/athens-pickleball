import Link from "next/link";

export const metadata = {
  title: "About — Tri-Star Pickleball",
  description:
    "Tri-Star Pickleball is a community-run platform for pickleball ladder leagues, free play, and Round Robin tournaments. Founded in 2026 by Michael Barlok in Athens, TN.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-10">
      <header className="space-y-2">
        <p className="text-eyebrow">About</p>
        <h1 className="text-heading">Built by pickleball players, for pickleball players.</h1>
        <p className="text-dark-200">
          Tri-Star Pickleball is an East Tennessee–based platform that grew out
          of the Athens, TN pickleball community and now serves groups across
          the Southeast. Founded in 2026 by Michael Barlok.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-title">Why we built Tri-Star</h2>
        <p className="text-sm text-dark-200 leading-relaxed">
          Tri-Star started because the existing options for running a ladder
          league only handled one playing style. Some groups want{" "}
          <strong>Court Promotion</strong>, where 1st on each court moves up
          one court and last moves down between sessions and players carry
          their court forward. Other groups want{" "}
          <strong>Dynamic Ranking</strong>, where every player&apos;s step and
          Points % recompute after each session and the courts re-seed from
          scratch the next time. Both are valid — they just suit different
          communities. Tri-Star supports both, plus Free Play with
          point-differential standings and Round Robin tournaments with seeded
          playoffs, in one place.
        </p>
        <p className="text-sm text-dark-200 leading-relaxed">
          We started in Athens, TN and are actively expanding to new
          pickleball communities across the Southeast.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-title">Our mission</h2>
        <p className="text-sm text-dark-200 leading-relaxed">
          Keep the game at the center. We build software that handles the logistics —
          sign-ups, waitlists, rankings, court promotions — so organizers can focus on
          running a great session and players can focus on playing.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-title">What we care about</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card card-static space-y-1.5">
            <p className="text-title">Fairness</p>
            <p className="text-caption">
              Promotion logic is deterministic and published — no black-box rankings.
            </p>
          </div>
          <div className="card card-static space-y-1.5">
            <p className="text-title">Clarity</p>
            <p className="text-caption">
              Every sheet, every score, every step change is visible and auditable.
            </p>
          </div>
          <div className="card card-static space-y-1.5">
            <p className="text-title">Speed</p>
            <p className="text-caption">
              Built for the moment before a session starts, when the bar is "it just works."
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-title">Contact</h2>
        <p className="text-sm text-dark-200 leading-relaxed">
          Questions, feedback, or running a league you want to move onto the platform? Email{" "}
          <a
            href="mailto:info@tristarpickleball.com"
            className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
          >
            info@tristarpickleball.com
          </a>
          .
        </p>
      </section>

      <div className="pt-4 border-t border-surface-border">
        <Link href="/" className="text-sm text-brand-400 hover:text-brand-300">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
