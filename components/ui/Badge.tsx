"use client";

import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-[#F3F4F6] text-[#4B5563]",
  accent:  "bg-[#FFE7D6] text-[#FF6B35]",
  success: "bg-[#D1FAE5] text-[#047857]",
  warning: "bg-[#FEF3C7] text-[#B45309]",
  danger:  "bg-[#FEE2E2] text-[#B91C1C]",
  info:    "bg-[#DBEAFE] text-[#1D4ED8]",
};

export default function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium
                  ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
