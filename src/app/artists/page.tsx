import type { Metadata } from "next";
import { has } from "@/lib/env";
import { getArtists } from "@/lib/queries";
import { ArtistManager } from "@/components/artist-manager";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/ui";
import { SetupScreen } from "@/components/setup-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Artists" };

export default async function ArtistsPage() {
  if (!has.db()) return <SetupScreen />;
  let artists;
  try {
    artists = await getArtists();
  } catch (e) {
    return <ErrorPanel message={(e as Error).message} />;
  }
  const active = artists.filter((a) => a.is_active);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Artists you follow"
        lede={`${active.length} artists. Starred favourites are checked on every scan; the rest rotate so no one goes unchecked for long.`}
      />
      <ArtistManager artists={artists} />
    </div>
  );
}
