"use client";

import React from "react";
import { Result, Button } from "antd";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary for the merchant portal.
 * Wrap route groups or complex pages to prevent white screens on unexpected throws.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
          <Result
            status="error"
            title="Something went wrong"
            subTitle={
              this.state.error?.message ||
              "An unexpected error occurred. Please refresh and try again."
            }
            extra={[
              <Button
                key="refresh"
                type="primary"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>,
              <Button
                key="home"
                onClick={() => { window.location.href = "/dashboard"; }}
              >
                Go to Dashboard
              </Button>,
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
