import { AlertTriangle } from "lucide-react";
import { LinkButton } from "./ui";

export function ErrorPanel({ message }: { message: string }) {
  const hint = /JWT|apikey|Invalid API key|permission denied|row-level security/i.test(message)
    ? "The database key looks wrong or the schema was not applied. Check SUPABASE_URL and the key in Vercel, then redeploy."
    : /fetch failed|ENOTFOUND|timeout/i.test(message)
      ? "The database did not answer. If the Supabase project is paused, restore it from the Supabase dashboard."
      : "Try again in a moment. If it keeps happening, open Live data to see the last error.";
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-urgent/30 bg-urgent-soft/40 px-6 py-10 text-center">
      <AlertTriangle className="text-urgent" />
      <h1 className="font-display text-xl font-bold">Couldn&apos;t load your data</h1>
      <p className="text-sm text-ink-2">{hint}</p>
      <code className="max-w-full overflow-x-auto rounded bg-surface px-2 py-1 text-xs text-muted">{message}</code>
      <LinkButton href="/settings" variant="secondary" size="sm">
        Open settings
      </LinkButton>
    </div>
  );
}
