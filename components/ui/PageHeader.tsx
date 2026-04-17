"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel = "Буцах",
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}>
      <div className="min-w-0 flex items-start gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="mt-1 inline-flex items-center justify-center w-9 h-9 rounded-lg
                       text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]
                       transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-[#6B7280] mt-1">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
