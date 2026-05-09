export const metadata = {
  title: "Contact — Tri-Star Pickleball",
  description:
    "Contact Tri-Star Pickleball with questions, feedback, or to move your pickleball ladder league or free-play group onto the platform. Based in Athens, TN.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="max-w-xl mx-auto py-16 sm:py-24 space-y-6">
      <h1 className="text-3xl font-bold text-dark-100 sm:text-4xl tracking-tight">
        Contact Us
      </h1>
      <p className="text-dark-200 text-base sm:text-lg leading-relaxed">
        Have questions, feedback, or want to learn more about Tri-Star Pickleball? We&apos;d love to hear from you.
      </p>
      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wide">Email</h2>
          <a
            href="mailto:info@tristarpickleball.com"
            className="text-brand-300 hover:text-brand-200 transition-colors text-base"
          >
            info@tristarpickleball.com
          </a>
        </div>
        <p className="text-sm text-dark-300">
          We typically respond within 24 hours.
        </p>
        {/* Semantic <address> with city/state — gives Google a postal-
            style block to parse for the local-SEO Knowledge Graph. We
            don't have a public street address, but city + state alone
            is still a strong local-intent signal. */}
        <div className="pt-3 border-t border-surface-border">
          <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wide">
            Based in
          </h2>
          <address className="mt-1 text-base not-italic text-dark-200">
            Tri-Star Pickleball, LLC
            <br />
            Athens, TN
            <br />
            <span className="text-sm text-surface-muted">
              East Tennessee · Serving groups across the Southeast
            </span>
          </address>
        </div>
      </div>
    </div>
  );
}
