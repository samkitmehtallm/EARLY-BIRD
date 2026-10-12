import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <div className="font-display text-6xl font-extrabold text-muted">404</div>
      <h1 className="font-display text-xl font-bold">That page isn&apos;t on the setlist</h1>
      <LinkButton href="/" variant="primary">Back to shows</LinkButton>
    </div>
  );
}
