/**
 * Canonical public URL for email links.
 *
 * Emails go to inboxes that may be opened weeks later, on devices
 * the sender never saw, by users following a link long after the
 * original deploy URL changed. They should always point at the
 * production marketing domain — never at a Vercel preview, a
 * `pkl-ball.app` deploy URL, or whatever `NEXT_PUBLIC_APP_URL`
 * happens to be set to in the environment that sent the email.
 *
 * Use this constant for every URL that ends up in an email:
 *   `${EMAIL_PUBLIC_URL}/tournaments/${id}`
 *   `${EMAIL_PUBLIC_URL}/profile/notifications`
 *
 * If we ever rebrand or move the public domain, this is the only
 * place to change.
 */
export const EMAIL_PUBLIC_URL = "https://tristarpickleball.com";
