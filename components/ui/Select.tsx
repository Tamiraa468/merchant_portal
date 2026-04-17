"use client";

import { useId } from "react";
import { Select as AntSelect, type SelectProps as AntSelectProps } from "antd";

export interface SelectProps<T = unknown> extends Omit<AntSelectProps<T>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export default function Select<T = unknown>({
  label,
  error,
  hint,
  fullWidth = true,
  className = "",
  ...rest
}: SelectProps<T>) {
  const reactId = useId();
  const id = `select-${reactId}`;

  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <AntSelect<T>
        id={id}
        size="large"
        status={error ? "error" : undefined}
        className={`merchant-select w-full ${className}`}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-xs text-[#EF4444]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-[#6B7280]">{hint}</p>
      ) : null}
    </div>
  );
}
