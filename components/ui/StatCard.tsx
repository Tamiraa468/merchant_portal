"use client";

import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";

export type StatCardTone = "purple" | "blue" | "orange" | "green" | "red";

const TONE_CLASSES: Record<StatCardTone, string> = {
  purple: "bg-[#F3E8FF] text-[#7C3AED]",
  blue:   "bg-[#DBEAFE] text-[#2563EB]",
  orange: "bg-[#FFE7D6] text-[#FF6B35]",
  green:  "bg-[#D1FAE5] text-[#059669]",
  red:    "bg-[#FEE2E2] text-[#DC2626]",
};

interface StatCardProps {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  tone?: StatCardTone;
  trend?: number | null;
  trendLabel?: string;
  loading?: boolean;
  size?: "default" | "wide";
}

export default function StatCard({
  label,
  value,
  Icon,
  tone = "orange",
  trend,
  trendLabel,
  loading = false,
  size = "default",
}: StatCardProps) {
  if (size === "wide") {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6 flex items-center gap-5">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">{label}</p>
          {loading ? (
            <div className="skeleton h-8 w-32 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-[#111827] mt-1 truncate">{value}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6 transition-shadow hover:shadow-md">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center ${TONE_CLASSES[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-[#6B7280] mt-4 font-medium uppercase tracking-wide">{label}</p>
      {loading ? (
        <div className="skeleton h-8 w-24 mt-2" />
      ) : (
        <p className="text-2xl font-bold text-[#111827] mt-1.5">{value}</p>
      )}
      {trend !== null && trend !== undefined && !loading && (
        <div
          className={`flex items-center gap-1 mt-2 text-xs font-medium
            ${trend >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}
        >
          {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          <span>{Math.abs(trend).toFixed(1)}% {trendLabel}</span>
        </div>
      )}
    </div>
  );
}
