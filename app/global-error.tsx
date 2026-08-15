"use client";
// tamtam inspected 2026-05-21

export const dynamic = "force-dynamic";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
