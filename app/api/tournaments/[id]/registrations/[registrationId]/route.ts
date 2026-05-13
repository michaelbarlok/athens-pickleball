import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin actions on a single tournament_registrations row.
 *
 * Authorization: caller must be the tournament's creator, a site
 * admin, OR listed in tournament_organizers for this tournament.
 * Self-service withdraw stays on DELETE /api/tournaments/[id]/register
 * (that endpoint requires the caller to BE the player or partner);
 * this one is the organizer-side override.
 *
 *   PATCH  — edit { division?, partner_id?, seed? }
 *   DELETE — withdraw the row (sets status='withdrawn', preserving
 *            history — same as the self-withdraw flow)
 */

async function authorizeOrganizer(
  tournamentId: string
): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createServiceClient>>; profileId: string }
  | { ok: false; res: NextResponse }
> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return { ok: false, res: auth };

  // Site admin shortcut.
  if (auth.profile.role === "admin") {
    const sc = await createServiceClient();
    return { ok: true, supabase: sc, profileId: auth.profile.id };
  }

  // Otherwise: must be the tournament's creator or in
  // tournament_organizers. Both run under the user-scoped client,
  // which is fine — RLS allows reading these rows for the relevant
  // viewer.
  const { data: tournament } = await auth.supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournament?.created_by !== auth.profile.id) {
    const { data: organizer } = await auth.supabase
      .from("tournament_organizers")
      .select("profile_id")
      .eq("tournament_id", tournamentId)
      .eq("profile_id", auth.profile.id)
      .maybeSingle();
    if (!organizer) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: "Only tournament organizers can do this." },
          { status: 403 }
        ),
      };
    }
  }

  // The write itself runs under the service client so it isn't
  // bound by tournament_registrations RLS (which lets only the
  // player + partner touch their own row).
  const sc = await createServiceClient();
  return { ok: true, supabase: sc, profileId: auth.profile.id };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const { id: tournamentId, registrationId } = await params;
  const guard = await authorizeOrganizer(tournamentId);
  if (!guard.ok) return guard.res;
  const sc = guard.supabase;

  const body = (await request.json().catch(() => ({}))) as {
    division?: string | null;
    partner_id?: string | null;
    seed?: number | null;
  };

  const { data: existing, error: fetchErr } = await sc
    .from("tournament_registrations")
    .select("id, tournament_id, player_id, partner_id, division, seed, status")
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.division !== undefined && body.division !== existing.division) {
    if (!body.division || typeof body.division !== "string") {
      return NextResponse.json({ error: "Invalid division" }, { status: 400 });
    }
    // Confirm the new division is actually configured on the tournament.
    const { data: t } = await sc
      .from("tournaments")
      .select("divisions")
      .eq("id", tournamentId)
      .single();
    const divs = (t?.divisions as string[] | null) ?? [];
    if (!divs.includes(body.division)) {
      return NextResponse.json(
        { error: `Tournament has no '${body.division}' division.` },
        { status: 400 }
      );
    }
    // Uniqueness collision: the player can't be active in the same
    // (tournament, division) twice.
    const { data: dupPlayer } = await sc
      .from("tournament_registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("player_id", existing.player_id)
      .eq("division", body.division)
      .neq("status", "withdrawn")
      .neq("id", registrationId)
      .maybeSingle();
    if (dupPlayer) {
      return NextResponse.json(
        { error: "Player already has an active registration in that division." },
        { status: 409 }
      );
    }
    updates.division = body.division;
  }

  if (body.partner_id !== undefined && body.partner_id !== existing.partner_id) {
    if (body.partner_id !== null && typeof body.partner_id !== "string") {
      return NextResponse.json({ error: "Invalid partner_id" }, { status: 400 });
    }
    if (body.partner_id === existing.player_id) {
      return NextResponse.json(
        { error: "Partner can't be the same person as the player." },
        { status: 400 }
      );
    }
    // Uniqueness: same partner can't be active twice in same
    // (tournament, division). Use the new division if it's being
    // edited in this same call.
    if (body.partner_id) {
      const targetDivision = (updates.division as string | undefined) ?? existing.division;
      const { data: dupPartner } = await sc
        .from("tournament_registrations")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("partner_id", body.partner_id)
        .eq("division", targetDivision)
        .neq("status", "withdrawn")
        .neq("id", registrationId)
        .maybeSingle();
      if (dupPartner) {
        return NextResponse.json(
          { error: "Partner already has an active registration in that division." },
          { status: 409 }
        );
      }
      // ...and they can't be the same partner_id as someone else's
      // player_id either (active double-booking).
      const { data: dupAsPlayer } = await sc
        .from("tournament_registrations")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("player_id", body.partner_id)
        .eq("division", targetDivision)
        .neq("status", "withdrawn")
        .neq("id", registrationId)
        .maybeSingle();
      if (dupAsPlayer) {
        return NextResponse.json(
          { error: "Partner is already playing in that division on their own registration." },
          { status: 409 }
        );
      }
    }
    updates.partner_id = body.partner_id;
  }

  if (body.seed !== undefined && body.seed !== existing.seed) {
    if (body.seed !== null && (typeof body.seed !== "number" || body.seed < 1)) {
      return NextResponse.json({ error: "Invalid seed" }, { status: 400 });
    }
    updates.seed = body.seed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const { error: updateErr } = await sc
    .from("tournament_registrations")
    .update(updates)
    .eq("id", registrationId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, changed: true, updates });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const { id: tournamentId, registrationId } = await params;
  const guard = await authorizeOrganizer(tournamentId);
  if (!guard.ok) return guard.res;
  const sc = guard.supabase;

  // Withdraw rather than hard-delete. Preserves the audit trail
  // (the team appears in the tournament's "withdrew" history) and
  // matches the schema convention used by the self-withdraw flow.
  // Partial unique indexes on (tournament_id, player_id, division)
  // are scoped WHERE status != 'withdrawn', so withdrawing frees
  // the slot for re-registration without any cleanup.
  const { error } = await sc
    .from("tournament_registrations")
    .update({ status: "withdrawn" })
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "withdrawn" });
}
