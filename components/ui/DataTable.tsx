"use client";

import { Table, type TableProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import Pagination from "./Pagination";
import EmptyState from "./EmptyState";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface DataTableProps<T> extends Omit<TableProps<T>, "pagination" | "columns" | "dataSource"> {
  columns: ColumnsType<T>;
  data: T[];
  rowKey: keyof T | ((row: T) => string);
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
  };
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

export default function DataTable<T extends object>({
  columns,
  data,
  rowKey,
  pagination,
  onRowClick,
  loading,
  emptyTitle = "Мэдээлэл алга байна",
  emptyDescription,
  emptyAction,
  ...rest
}: DataTableProps<T>) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <Table<T>
        columns={columns}
        dataSource={data}
        rowKey={rowKey as never}
        loading={loading}
        pagination={false}
        scroll={{ x: 800 }}
        className="merchant-table"
        locale={{
          emptyText: (
            <EmptyState
              icon={Inbox}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          ),
        }}
        onRow={
          onRowClick
            ? (row) => ({
                onClick: () => onRowClick(row),
                style: { cursor: "pointer" },
              })
            : undefined
        }
        {...rest}
      />
      {pagination && (
        <div className="px-6 py-4 border-t border-[#E5E7EB]">
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={pagination.onChange}
          />
        </div>
      )}
    </div>
  );
}
