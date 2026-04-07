import { Tag } from "antd";
import type { TaskStatus } from "@/types/database";

const statusColors: Record<TaskStatus, string> = {
  draft: "default",
  created: "default",
  published: "cyan",
  assigned: "orange",
  picked_up: "purple",
  delivered: "green",
  completed: "green",
  cancelled: "red",
  failed: "magenta",
};

const statusLabels: Record<TaskStatus, string> = {
  draft: "Draft",
  created: "Draft",
  published: "Published",
  assigned: "Assigned",
  picked_up: "Picked Up",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

interface StatusBadgeProps {
  status: TaskStatus;
  size?: "sm" | "md" | "lg";
}

/**
 * Shared status tag for delivery tasks.
 * Eliminates the statusColors / statusLabels maps duplicated across task pages.
 */
export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const sizeClass = size === "lg" ? "text-base px-3 py-1" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <Tag color={statusColors[status] ?? "default"} className={sizeClass}>
      {statusLabels[status] ?? status}
    </Tag>
  );
}

export { statusColors, statusLabels };
