import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Quinn", "Avery",
  "Cameron", "Drew", "Finley", "Harper", "Hayden", "Jesse", "Kai", "Lane",
  "Micah", "Noel", "Parker", "Peyton", "Reese", "River", "Rowan", "Sage",
  "Skyler", "Blake", "Charlie", "Dakota", "Emerson", "Frankie", "Gray",
  "Harley", "Jaden", "Kendall", "Logan", "Mackenzie", "Oakley", "Phoenix", "Spencer",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Anderson", "Thomas", "Jackson", "White", "Harris",
  "Martin", "Thompson", "Moore", "Young", "Allen", "King", "Wright", "Scott",
  "Torres", "Hill", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell",
  "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards",
];

export async function POST(request: Request) {
  const url = new URL(request.url);
  const querySheetId = url.searchParams.get("sheetId");
  const body = await request.json().catch(() => ({}));
  const sheetId = querySheetId || body.sheetId;
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const serviceClient = await createServiceClient();

  // Find the sheet
  let sheet: { id: string; player_limit: number; group_id: string } | null = null;

  if (sheetId) {
    const { data } = await serviceClient
      .from("signup_sheets")
      .select("id, player_limit, group_id")
      .eq("id", sheetId)
      .single();
    sheet = data;
  } else {
    const { data } = await serviceClient
      .from("signup_sheets")
      .select("id, player_limit, group_id")
      .eq("status", "open")
      .order("event_date", { ascending: true })
      .limit(1)
      .single();
    sheet = data;
  }

  if (!sheet) {
    return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
  }

  // Clean up any existing test data first
  const { data: existingTest } = await serviceClient
    .from("profiles")
    .select("id, user_id")
    .like("display_name", "[TEST]%");

  if (existingTest && existingTest.length > 0) {
    const existingIds = existingTest.map((p) => p.id);
    const existingAuthIds = existingTest.map((p) => p.user_id).filter(Boolean);

    await Promise.all([
      serviceClient.from("registrations").delete().in("player_id", existingIds),
      serviceClient.from("group_memberships").delete().in("player_id", existingIds),
    ]);
    await serviceClient.from("profiles").delete().in("id", existingIds);
    await Promise.all(existingAuthIds.map((id) => serviceClient.auth.admin.deleteUser(id)));
  }

  // Clean up orphaned test auth users
  const { data: authUsers } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  if (authUsers?.users) {
    const orphaned = authUsers.users.filter((u) => u.email?.endsWith("@test.local"));
    if (orphaned.length > 0) {
      await Promise.all(orphaned.map((u) => serviceClient.auth.admin.deleteUser(u.id)));
    }
  }

  // Create 39 test auth users in parallel
  const userResults = await Promise.all(
    FIRST_NAMES.map((firstName, i) => {
      const lastName = LAST_NAMES[i];
      const email = `test-${firstName.toLowerCase()}-${lastName.toLowerCase()}@test.local`;
      return serviceClient.auth.admin.createUser({
        email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { full_name: `${firstName} ${lastName}` },
      });
    })
  );

  // Collect successful auth users with their index
  const created: { userId: string; index: number; step: number; pct: number }[] = [];
  for (let i = 0; i < userResults.length; i++) {
    const { data: authUser, error: authErr } = userResults[i];
    if (authErr || !authUser.user) {
      console.error(`Failed to create auth user ${FIRST_NAMES[i]}:`, authErr?.message);
      continue;
    }
    created.push({
      userId: authUser.user.id,
      index: i,
      step: Math.floor(Math.random() * 6) + 1,
      pct: Math.round((Math.random() * 40 + 50) * 10) / 10,
    });
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "Failed to create any auth users" }, { status: 500 });
  }

  // Bulk insert profiles
  const profileInserts = created.map((c) => {
    const firstName = FIRST_NAMES[c.index];
    const lastName = LAST_NAMES[c.index];
    return {
      user_id: c.userId,
      full_name: `${firstName} ${lastName}`,
      display_name: `[TEST] ${firstName} ${lastName}`,
      email: `test-${firstName.toLowerCase()}-${lastName.toLowerCase()}@test.local`,
      role: "player" as const,
      is_active: true,
      member_since: new Date().toISOString(),
      preferred_notify: ["email"],
    };
  });

  const { data: inserted, error: insertErr } = await serviceClient
    .from("profiles")
    .insert(profileInserts)
    .select("id");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (!inserted || inserted.length === 0) {
    return NextResponse.json({ error: "No profiles created" }, { status: 500 });
  }

  // Bulk insert group memberships + registrations in parallel
  const { count: existingConfirmed } = await serviceClient
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("sheet_id", sheet.id)
    .eq("status", "confirmed");

  const spotsLeft = sheet.player_limit - (existingConfirmed ?? 0);

  const registrations = inserted.map((p, i) => {
    const isConfirmed = i < spotsLeft;
    return {
      sheet_id: sheet.id,
      player_id: p.id,
      status: isConfirmed ? "confirmed" : "waitlist",
      waitlist_position: isConfirmed ? null : i - spotsLeft + 1,
      registered_by: profile.id,
    };
  });

  const memberships = sheet.group_id
    ? inserted.map((p, i) => ({
        player_id: p.id,
        group_id: sheet.group_id,
        current_step: created[i].step,
        win_pct: created[i].pct,
        total_sessions: Math.floor(Math.random() * 20) + 1,
        last_played_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      }))
    : null;

  const { error: regErr } = await serviceClient
    .from("registrations")
    .insert(registrations);

  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }

  if (memberships) {
    await serviceClient.from("group_memberships").insert(memberships);
  }

  return NextResponse.json({
    success: true,
    created: inserted.length,
    sheetId: sheet.id,
    confirmed: Math.min(inserted.length, spotsLeft),
    waitlisted: Math.max(0, inserted.length - spotsLeft),
  });
}
