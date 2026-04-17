"use client";

import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
}

function dim(v: number | string): string {
  return typeof v === "number" ? `${v}px` : v;
}

export default function Skeleton({
  width = "100%",
  height = "1em",
  radius = 6,
  dark = false,
  className = "",
  style,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`${dark ? "skeleton-dark" : "skeleton"} ${className}`}
      style={{
        width: dim(width),
        height: dim(height),
        borderRadius: dim(radius),
        ...style,
      }}
    />
  );
}
