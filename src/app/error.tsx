"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function Error({ error }: { error: Error }) {
  return <ErrorPanel message={error.message} />;
}
