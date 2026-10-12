import { has } from "@/lib/env";
import { getFeed, integrations } from "@/lib/queries";
import { Feed, GoingStrip, StatStrip } from "@/components/feed";
import { SetupChecklist } from "@/components/setup-checklist";
import { SetupScreen } from "@/components/setup-screen";
import { ErrorPanel } from "@/components/error-panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!has.db()) return <SetupScreen />;

  let events, ints;
  try {
    [events, ints] = await Promise.all([getFeed(), integrations()]);
  } catch (e) {
    return <ErrorPanel message={(e as Error).message} />;
  }
  const googleConnected = ints.find((i) => i.id === "google")?.state === "connected";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[42px] sm:leading-[1.05]">Shows from artists you follow</h1>
        <p className="max-w-2xl text-[15px] text-muted">
          Checked across BookMyShow, District, Ticketmaster and the open web. Bengaluru first, the rest of India below. Early-bird windows are
          flagged the moment they open.
        </p>
      </div>
      <SetupChecklist items={ints} />
      <StatStrip events={events} />
      <GoingStrip events={events} />
      <Feed events={events} googleConnected={googleConnected} />
    </div>
  );
}
