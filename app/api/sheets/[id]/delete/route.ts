import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { recalculateAllWinPcts, subtractSessionsFromTotals } from "@/lib/queries/rankings";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sheetId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const admin = await createServiceClient();

  // Capture group_id + the list of completed session_ids about to be
  // cascade-deleted. We need the session ids BEFORE the delete so we
  // can subtract their participant bumps from
  // `group_memberships.total_sessions` — once the rows are gone the
  // (player_id, session_id) link is too.
  const { data: sheet } = await admin
    .from("signup_sheets")
    .select("group_id")
    .eq("id", sheetId)
    .single();
  const groupId = sheet?.group_id ?? null;

  const { data: completedSessions } = await admin
    .from("shootout_sessions")
    .select("id")
    .eq("sheet_id", sheetId)
    .eq("status", "session_complete");
  const completedSessionIds = (completedSessions ?? []).map(
    (s: { id: string }) => s.id
  );

  // Delete registrations (no cascade from signup_sheets)
  await admin
    .from("registrations")
    .delete()
    .eq("sheet_id", sheetId);

  // Roll back the per-completed-session total_sessions bumps BEFORE
  // the cascade delete — once shootout_sessions rows are gone, the
  // participant counts can't be re-derived.
  if (completedSessionIds.length > 0) {
    await subtractSessionsFromTotals(completedSessionIds, admin).catch((e) =>
      console.error("total_sessions rollback before sheet delete failed:", e)
    );
  }

  // Delete the sheet — cascades to shootout_sessions → session_participants
  // and game_results (via FK added in migration 068)
  const { error } = await admin
    .from("signup_sheets")
    .delete()
    .eq("id", sheetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Recalculate win% for all group members so the rolling-window
  // average reflects the deletion. Background — the delete response
  // doesn't wait on it.
  if (groupId) {
    recalculateAllWinPcts(groupId, admin).catch((e) =>
      console.error("win% recalc after sheet delete failed:", e)
    );
  }

  revalidatePath("/sheets");
  revalidatePath("/admin/sheets");

  return NextResponse.json({ success: true });
}
