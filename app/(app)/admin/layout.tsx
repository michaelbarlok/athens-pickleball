import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/");

  // Allow global admins
  if (profile.role === "admin") return <>{children}</>;

  // Allow group admins
  const { data: groupAdminCheck } = await supabase
    .from("group_memberships")
    .select("group_role")
    .eq("player_id", profile.id)
    .eq("group_role", "admin")
    .limit(1);

  if (groupAdminCheck && groupAdminCheck.length > 0) return <>{children}</>;

  // Not authorized
  redirect("/");
}
