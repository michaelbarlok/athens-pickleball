import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, fullName, email } = body as {
      userId?: string;
      fullName?: string;
      email?: string;
    };

    if (!userId || !fullName || !email) {
      return NextResponse.json(
        { error: "userId, fullName, and email are required" },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // Verify the auth user exists
    const { data: authUser, error: authError } =
      await serviceClient.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: "Invalid user" },
        { status: 400 }
      );
    }

    // Check if profile already exists
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      return NextResponse.json({ profile: existing }, { status: 200 });
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .insert({
        user_id: userId,
        full_name: fullName,
        display_name: fullName,
        email,
        role: "player",
        member_since: new Date().toISOString(),
        preferred_notify: ["email"],
      })
      .select("*")
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
