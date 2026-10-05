"use client";

// Replaces the root layout when it fails, so it cannot rely on globals.css
// tokens or app providers.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light",
        }}
      >
        <div role="alert" style={{ maxWidth: 360, padding: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            This page hit a problem
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "8px 0 16px" }}>
            Your saved work is not affected. Try again, or reload the page if
            it keeps happening.
          </p>
          <button type="button" onClick={reset} style={{ marginRight: 8 }}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
