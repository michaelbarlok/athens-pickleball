"use client";

import { FormError } from "@/components/form-error";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { US_STATES } from "@/lib/us-states";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function NewClubPage() {
  const router = useRouter();
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
      const res = await fetch("/api/admin/clubs", {
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
      router.push(`/admin/clubs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create club.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Clubs", href: "/admin/clubs" }, { label: "New" }]} />
      <PageHeader eyebrow="Admin" title="Create Club" />

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
            URL slug will be auto-generated from the name. You can edit it later.
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
            placeholder="What this club is about, who runs it, etc."
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
          <Link href="/admin/clubs" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={submitting || !name.trim()} className="btn-primary">
            {submitting ? "Creating…" : "Create Club"}
          </button>
        </div>
      </form>
    </div>
  );
}
