import { Card } from "./ui";

/** Shown only when the database itself is not configured — everything else degrades gracefully. */
export function SetupScreen() {
  const steps = [
    ["Create a Supabase project", "Any region works; ap-south-1 (Mumbai) is closest to Bengaluru."],
    ["Run the schema", "Paste supabase/migrations/0001_init.sql, then supabase/seed.sql, into the SQL editor."],
    ["Add environment variables in Vercel", "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are enough to start. Redeploy."],
    ["Open the app again", "The seeded artists and shows appear. Add Gemini, ScrapingBee and Google keys whenever you are ready."],
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
      <div>
        <div className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">One-time setup</div>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">Connect a database to start</h1>
        <p className="mt-2 text-muted">Early Bird keeps its watchlist, shows and alert history in Supabase. Four steps, about five minutes.</p>
      </div>
      <Card className="divide-y divide-line">
        {steps.map(([t, b], i) => (
          <div key={t} className="flex gap-4 p-5">
            <span className="tabular font-display text-2xl font-extrabold text-accent">{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="text-sm text-muted">{b}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
