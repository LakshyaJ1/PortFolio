"use client";

// Last-resort boundary (the root layout itself failed), so no shared CSS is available here.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          background: "#0b100d",
          color: "#cfd8d1",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <title>Lost the fix · Lakshya Jain</title>
        <main style={{ maxWidth: 560 }}>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.14em", color: "#6f7f75" }}>
            SIGNAL LOST{error.digest ? ` · ${error.digest}` : ""}
          </p>
          <h1 style={{ color: "#eef2ec", fontSize: 44, margin: "12px 0" }}>The sheet failed to load.</h1>
          <p style={{ lineHeight: 1.6 }}>
            Try again, or reach Lakshya directly at{" "}
            <a style={{ color: "#ff7a45" }} href="mailto:10jainlakshya@gmail.com">
              10jainlakshya@gmail.com
            </a>
            .
          </p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 20, height: 46, padding: "0 22px", border: 0, borderRadius: 2, background: "#ff5b23", color: "#060907", fontWeight: 700, cursor: "pointer" }}
          >
            Re-acquire
          </button>
        </main>
      </body>
    </html>
  );
}
