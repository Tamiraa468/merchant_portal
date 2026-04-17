"use client";

import { Pagination as AntPagination, type PaginationProps as AntPaginationProps } from "antd";

interface PaginationProps extends AntPaginationProps {
  total: number;
  current: number;
  pageSize: number;
  onChange: (page: number) => void;
  showRange?: boolean;
}

export default function Pagination({
  total,
  current,
  pageSize,
  onChange,
  showRange = true,
  className = "",
  ...rest
}: PaginationProps) {
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${className}`}>
      {showRange && (
        <span className="text-xs text-[#6B7280]">
          {total === 0 ? "0 мөр" : `${start}–${end} / ${total} мөр`}
        </span>
      )}
      <AntPagination
        current={current}
        pageSize={pageSize}
        total={total}
        onChange={onChange}
        showSizeChanger={false}
        size="small"
        {...rest}
      />
    </div>
  );
}
