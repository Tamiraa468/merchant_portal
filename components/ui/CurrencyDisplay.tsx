interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg font-semibold",
  xl: "text-2xl font-bold",
};

/**
 * Shared currency formatter.
 * Defaults to Mongolian Tögrög (₮).
 */
export default function CurrencyDisplay({
  amount,
  currency = "₮",
  className = "",
  size = "md",
}: CurrencyDisplayProps) {
  return (
    <span className={`${sizeClasses[size]} ${className}`}>
      {currency}{(amount ?? 0).toLocaleString()}
    </span>
  );
}
