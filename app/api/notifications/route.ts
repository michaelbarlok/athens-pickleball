import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Narrow to the columns the bell dropdown actually renders. The
  // table also has user_id / type / group_id which the UI doesn't
  // consume, so skipping them keeps the per-render payload small —
  // the bell hits this endpoint on every page render.
  const { data, error } = await auth.supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .eq("user_id", auth.profile.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
