"use client";

import { useId } from "react";
import { DatePicker as AntDatePicker } from "antd";
import type { DatePickerProps as AntDatePickerProps } from "antd";

interface DatePickerProps extends Omit<AntDatePickerProps, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export default function DatePicker({
  label,
  error,
  hint,
  fullWidth = true,
  className = "",
  ...rest
}: DatePickerProps) {
  const reactId = useId();
  const id = `datepicker-${reactId}`;

  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <AntDatePicker
        id={id}
        size="large"
        status={error ? "error" : undefined}
        className={`w-full ${className}`}
        placeholder="Огноо сонгох"
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

export const RangePicker = AntDatePicker.RangePicker;
