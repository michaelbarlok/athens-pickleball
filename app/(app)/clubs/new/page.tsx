import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { NewClubForm } from "./new-club-form";

/**
 * Create a new club. Open to any signed-in user — there's no
 * site-admin gate. The creator is automatically promoted to club
 * admin (see /api/clubs POST handler) and is taken straight to the
 * public club page on success.
 */
export default async function NewClubPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/clubs/new");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "Clubs", href: "/clubs" }, { label: "New" }]} />
      <PageHeader title="Create Club" />
      <NewClubForm />
    </div>
  );
}
