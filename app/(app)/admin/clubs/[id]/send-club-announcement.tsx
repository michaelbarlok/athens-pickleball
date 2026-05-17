"use client";

import { useState } from "react";

interface Props {
  clubId: string;
  memberCount: number;
}

/**
 * Site/club admin UI for broadcasting a club-wide announcement.
 * Posts to /api/clubs/[id]/announcements which persists a row in
 * `club_announcements` and fans out push + email via notifyMany.
 *
 * No attachments today — kept narrow on purpose. The group equivalent
 * supports attachments via a storage bucket; once we see a real
 * request for it we can mirror that pipeline.
 */
export function SendClubAnnouncement({ clubId, memberCount }: Props) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function send() {
    setResult(null);
    if (!title.trim() || !message.trim()) {
      setResult({ type: "error", text: "Title and message are required." });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", text: data.error ?? "Failed to send" });
        return;
      }
      setTitle("");
      setMessage("");
      setResult({ type: "success", text: `Sent to ${data.sent ?? 0} member${data.sent === 1 ? "" : "s"}.` });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold text-dark-100">Send Announcement</h2>
        <p className="mt-1 text-xs text-surface-muted">
          Broadcast to all {memberCount} club member{memberCount === 1 ? "" : "s"} via push + email
          (respecting each member's notification preferences).
        </p>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={200}
        className="input"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's the news?"
        maxLength={4000}
        className="input min-h-[100px]"
      />
      {result && (
        <p className={`text-xs ${result.type === "success" ? "text-teal-400" : "text-red-400"}`}>
          {result.text}
        </p>
      )}
      <div className="flex justify-end">
        <button onClick={send} disabled={sending} className="btn-primary">
          {sending ? "Sending…" : "Send Announcement"}
        </button>
      </div>
    </section>
  );
}
