import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { threadId } = await request.json();

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("author_id, title")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Don't notify if the replier is the thread author
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profile?.id === thread.author_id) {
      return NextResponse.json({ status: "skipped" });
    }
  }

  await notify({
    userId: thread.author_id,
    type: "forum_reply",
    title: "New reply to your thread",
    body: `Someone replied to "${thread.title}"`,
    link: `/forum/${threadId}`,
    emailTemplate: "ForumReply",
    emailData: { threadTitle: thread.title, threadId },
  });

  return NextResponse.json({ status: "notified" });
}
