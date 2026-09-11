'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the diagnostic in the local developer console without exposing it in
    // the visualization surface.
    console.error(error);
  }, [error]);

  return (
    <main className="error-shell">
      <section className="error-card" aria-labelledby="error-title">
        <CircleAlert aria-hidden="true" />
        <div>
          <h1 id="error-title">The visualization stopped unexpectedly</h1>
          <p>
            Your local model and prompt were not changed. Reload the graph
            surface and reconnect if needed.
          </p>
        </div>
        <Button onClick={reset}>
          <RefreshCw aria-hidden="true" />
          Reload visualization
        </Button>
      </section>
    </main>
  );
}
