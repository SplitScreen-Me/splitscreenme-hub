'use client';

/** Last-resort boundary (the root layout itself failed): no layout, no fonts, inline styles only. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
        <main
          style={{ maxWidth: 560, margin: '20vh auto', padding: 24, background: '#14171e', borderRadius: 14 }}
        >
          <h1 style={{ marginTop: 0 }}>SplitScreen.Me is having trouble</h1>
          <p style={{ color: '#a3abba' }}>
            Please try again in a moment.{error.digest ? ` Reference: ${error.digest}` : ''}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 8,
              background: '#f3f4f6',
              color: '#07080a',
              fontWeight: 650,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
