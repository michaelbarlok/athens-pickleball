import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";

/**
 * DELETE: Delete a tournament (creator, co-organizer, or admin).
 * Cascades to tournament_registrations and tournament_matches via FK.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete tournament (cascades to registrations and matches)
  const { error } = await auth.supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}
