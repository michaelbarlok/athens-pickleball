import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { playerId, groupId, groupRole } = body;

  if (!playerId || !groupId || !["admin", "member"].includes(groupRole)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const admin = await createServiceClient();

  // Update the group_role on the membership
  const { error } = await admin
    .from("group_memberships")
    .update({ group_role: groupRole })
    .eq("player_id", playerId)
    .eq("group_id", groupId);

  if (error) {
    // If column doesn't exist yet (migration not applied), return a helpful message
    if (error.message.includes("group_role")) {
      return NextResponse.json(
        { error: "The group_role column has not been added yet. Please apply migration 012_group_admin_role.sql." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
