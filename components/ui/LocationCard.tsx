import { Typography } from "antd";

const { Text } = Typography;

interface LocationCardProps {
  label: string;
  address: string;
  note?: string | null;
  variant?: "pickup" | "dropoff";
}

const variantStyles = {
  pickup: "bg-blue-50 dark:bg-blue-900/20",
  dropoff: "bg-green-50 dark:bg-green-900/20",
};

/**
 * Reusable location card used in task detail and task form.
 */
export default function LocationCard({ label, address, note, variant = "pickup" }: LocationCardProps) {
  return (
    <div>
      <Text type="secondary" className="text-xs uppercase">{label}</Text>
      <div className={`mt-1 p-3 rounded-lg ${variantStyles[variant]}`}>
        <Text strong>{address || "N/A"}</Text>
        {note && (
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{note}</div>
        )}
      </div>
    </div>
  );
}
