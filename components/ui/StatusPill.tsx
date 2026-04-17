"use client";

export type StatusKey =
  | "completed"
  | "pending"
  | "processing"
  | "cancelled"
  | "return"
  | "active"
  | "inactive"
  | "in_stock"
  | "out_of_stock"
  | "low_stock";

interface StatusConfig {
  label: string;
  dot: string;     // background class for the dot
  text: string;    // text color class
  bg: string;      // soft bg color (for pill variant)
}

export const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  completed:    { label: "Дууссан",         dot: "bg-[#10B981]", text: "text-[#047857]", bg: "bg-[#D1FAE5]" },
  pending:      { label: "Хүлээгдэж буй",   dot: "bg-[#F59E0B]", text: "text-[#B45309]", bg: "bg-[#FEF3C7]" },
  processing:   { label: "Боловсруулж буй", dot: "bg-[#3B82F6]", text: "text-[#1D4ED8]", bg: "bg-[#DBEAFE]" },
  cancelled:    { label: "Цуцлагдсан",      dot: "bg-[#9CA3AF]", text: "text-[#4B5563]", bg: "bg-[#F3F4F6]" },
  return:       { label: "Буцаалт",         dot: "bg-[#EF4444]", text: "text-[#B91C1C]", bg: "bg-[#FEE2E2]" },
  active:       { label: "Идэвхтэй",        dot: "bg-[#10B981]", text: "text-[#047857]", bg: "bg-[#D1FAE5]" },
  inactive:     { label: "Идэвхгүй",        dot: "bg-[#9CA3AF]", text: "text-[#4B5563]", bg: "bg-[#F3F4F6]" },
  in_stock:     { label: "Нөөцөд бий",      dot: "bg-[#10B981]", text: "text-[#047857]", bg: "bg-[#D1FAE5]" },
  out_of_stock: { label: "Дууссан",         dot: "bg-[#EF4444]", text: "text-[#B91C1C]", bg: "bg-[#FEE2E2]" },
  low_stock:    { label: "Бага үлдэгдэл",   dot: "bg-[#F59E0B]", text: "text-[#B45309]", bg: "bg-[#FEF3C7]" },
};

interface StatusPillProps {
  status: StatusKey;
  variant?: "dot" | "soft";  // dot = label with dot, soft = filled pill
  label?: string;            // override the default label
  className?: string;
}

export default function StatusPill({
  status,
  variant = "dot",
  label,
  className = "",
}: StatusPillProps) {
  const cfg = STATUS_CONFIG[status];
  const text = label ?? cfg.label;

  if (variant === "soft") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                    ${cfg.bg} ${cfg.text} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {text}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${cfg.text} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {text}
    </span>
  );
}
