import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function RatingsPage() {
  const supabase = await createClient();

  const { data: ratings } = await supabase
    .from("player_ratings")
    .select("*, player:profiles(id, display_name, avatar_url, is_active)")
    .order("display_rating", { ascending: false });

  const activeRatings = ratings?.filter((r) => r.player?.is_active) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Player Ratings</h1>
        <p className="text-sm text-gray-600">
          ELO-based skill ratings across all groups (2.0–5.0 USAP scale)
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 w-16">Rank</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Player</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Rating</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Games</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {activeRatings.map((r, i) => (
              <tr key={r.player_id}>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-500">
                  {i + 1}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Link href={`/players/${r.player_id}`} className="flex items-center gap-3 hover:text-brand-600">
                    {r.player?.avatar_url ? (
                      <img src={r.player.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-medium">
                        {r.player?.display_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {r.player?.display_name}
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-sm font-semibold text-brand-700">
                    {r.display_rating.toFixed(1)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {r.games_played}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {r.rating_updated_at
                    ? new Date(r.rating_updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
            {activeRatings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No rated players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
