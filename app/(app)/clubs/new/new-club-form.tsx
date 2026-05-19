"use client";

import { FormError } from "@/components/form-error";
import { US_STATES } from "@/lib/us-states";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

// Safe redirect targets for the post-create returnTo round-trip. We
// allowlist rather than echoing the user's input so a stale or
// malicious returnTo can't bounce them off the platform.
const ALLOWED_RETURN_PATHS = new Set(["/groups/new"]);

export function NewClubForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo") ?? "";
  const returnTo = ALLOWED_RETURN_PATHS.has(rawReturnTo) ? rawReturnTo : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          city: city.trim() || null,
          state: stateCode || null,
          visibility,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create club.");
        setSubmitting(false);
        return;
      }
      // If the user came in via /groups/new (returnTo round-trip),
      // bounce them back with the new club pre-selected in the picker.
      // Otherwise land them on the public club page — they can hit
      // "Manage Club" from there for fine-grained edits.
      if (returnTo) {
        router.push(`${returnTo}?selectedClub=${encodeURIComponent(data.id)}`);
      } else {
        router.push(`/clubs/${data.slug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create club.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          maxLength={120}
          required
          placeholder="e.g. Cleveland Pickleball Association"
        />
        <p className="mt-1 text-xs text-surface-muted">
          You become the first club admin automatically. The URL slug is generated
          from the name (you can change it later from the manage page).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input min-h-[80px]"
          maxLength={2000}
          placeholder="What this club is about, who runs it, member dues if any, etc."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input"
            placeholder="e.g. Cleveland"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">State</label>
          <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className="input">
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-surface-muted">
        This is the club&apos;s home city. Groups inside the club can be in different
        cities or states — each group keeps its own location.
      </p>

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-1">Visibility</label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "public" | "private")}
          className="input"
        >
          <option value="public">Public — anyone can find and join</option>
          <option value="private">Private — invite-only via shareable link</option>
        </select>
      </div>

      <FormError message={error} />

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link href="/clubs" className="btn-secondary">Cancel</Link>
        <button type="submit" disabled={submitting || !name.trim()} className="btn-primary">
          {submitting ? "Creating…" : "Create Club"}
        </button>
      </div>
    </form>
  );
}
