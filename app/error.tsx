"use client";

import { useEffect } from "react";
import { Result, Button } from "antd";

/**
 * Next.js App Router global error boundary.
 * Rendered when an unhandled error is thrown in a route segment.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <Result
          status="error"
          title="Something went wrong"
          subTitle={
            error.message ||
            "An unexpected error occurred. Please try again."
          }
          extra={[
            <Button key="reset" type="primary" onClick={reset}>
              Try Again
            </Button>,
            <Button key="home" onClick={() => { window.location.href = "/dashboard"; }}>
              Go to Dashboard
            </Button>,
          ]}
        />
      </body>
    </html>
  );
}
