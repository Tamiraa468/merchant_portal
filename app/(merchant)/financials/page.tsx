"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Table,
  Button,
  Typography,
  Card,
  Statistic,
  Space,
  Tag,
  App,
  Spin,
  DatePicker,
} from "antd";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface EarningsRow {
  id: string;
  amount: number;
  created_at: string;
  task_id: string;
  task: {
    receiver_name: string | null;
    delivery_fee: number;
    status: string;
    completed_at: string | null;
  } | null;
}

interface WeeklySummary {
  week: string;
  payouts: number;
  deliveries: number;
}

const PAGE_SIZE = 15;

export default function FinancialsPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<EarningsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, "day"),
    dayjs(),
  ]);

  const fetchData = useCallback(async (oid: string, currentPage: number, range: [Dayjs, Dayjs]) => {
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const since = range[0].startOf("day").toISOString();
    const until = range[1].endOf("day").toISOString();

    try {
      // Paginated ledger
      const { data, error, count } = await supabase
        .from("courier_earnings")
        .select(
          `id, amount, created_at, task_id,
           task:delivery_tasks!task_id(receiver_name, delivery_fee, status, completed_at)`,
          { count: "exact" },
        )
        .eq("task.org_id", oid)
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      // Supabase returns joined rows; normalize task from array to object
      const normalized = (data ?? []).map((r) => ({
        ...r,
        task: Array.isArray(r.task) ? r.task[0] ?? null : r.task,
      }));
      setRows(normalized as EarningsRow[]);
      setTotal(count ?? 0);

      // Total for the range
      const { data: allRows } = await supabase
        .from("courier_earnings")
        .select("amount, task:delivery_tasks!task_id(org_id)")
        .eq("task.org_id", oid)
        .gte("created_at", since)
        .lte("created_at", until);

      const total_ = (allRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
      setTotalEarnings(total_);

      // Weekly summaries (group client-side for simplicity)
      const weekMap: Record<string, WeeklySummary> = {};
      (allRows ?? []).forEach((r) => {
        const created = (r as { created_at?: string }).created_at ?? "";
        const weekStart = dayjs(created).startOf("week").format("MMM D");
        if (!weekMap[weekStart]) weekMap[weekStart] = { week: weekStart, payouts: 0, deliveries: 0 };
        weekMap[weekStart].payouts += r.amount ?? 0;
        weekMap[weekStart].deliveries += 1;
      });
      setWeeklySummaries(Object.values(weekMap).reverse().slice(0, 8));
    } catch {
      message.error("Failed to load financials");
    } finally {
      setLoading(false);
    }
  }, [supabase, message]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (profile?.org_id) {
        setOrgId(profile.org_id);
        fetchData(profile.org_id, 1, dateRange);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /** Export visible ledger to CSV */
  const handleExportCSV = () => {
    const headers = ["Date", "Task ID", "Receiver", "Delivery Fee (₮)", "Payout (₮)", "Status"];
    const csvRows = rows.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      r.task_id,
      r.task?.receiver_name ?? "",
      r.task?.delivery_fee ?? 0,
      r.amount,
      r.task?.status ?? "",
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map(String).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `earnings-${dateRange[0].format("YYYY-MM-DD")}-to-${dateRange[1].format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ledgerColumns: ColumnsType<EarningsRow> = [
    {
      title: "Date",
      dataIndex: "created_at",
      key: "date",
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: "Receiver",
      key: "receiver",
      render: (_, r) => r.task?.receiver_name ?? <Text type="secondary">—</Text>,
    },
    {
      title: "Delivery Fee",
      key: "fee",
      render: (_, r) => `₮${(r.task?.delivery_fee ?? 0).toLocaleString()}`,
      align: "right",
      responsive: ["md"],
    },
    {
      title: "Courier Payout",
      dataIndex: "amount",
      key: "amount",
      render: (v: number) => (
        <span className="font-semibold text-green-600">₮{v.toLocaleString()}</span>
      ),
      align: "right",
    },
    {
      title: "Status",
      key: "status",
      render: (_, r) => (
        <Tag color="green">{r.task?.status ?? "completed"}</Tag>
      ),
      responsive: ["lg"],
    },
  ];

  const weeklyColumns: ColumnsType<WeeklySummary> = [
    { title: "Week of", dataIndex: "week", key: "week" },
    { title: "Deliveries", dataIndex: "deliveries", key: "deliveries", align: "right" },
    {
      title: "Total Payouts",
      dataIndex: "payouts",
      key: "payouts",
      render: (v: number) => <span className="font-semibold text-green-600">₮{v.toLocaleString()}</span>,
      align: "right",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-700" aria-label="Back">
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="mb-0!">Financials</Title>
            </div>
            <Space wrap>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    const range: [Dayjs, Dayjs] = [dates[0], dates[1]];
                    setDateRange(range);
                    setPage(1);
                    if (orgId) fetchData(orgId, 1, range);
                  }
                }}
              />
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                disabled={rows.length === 0}
                aria-label="Export to CSV"
              >
                Export CSV
              </Button>
            </Space>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loading && page === 1 ? (
          <div className="flex justify-center py-20"><Spin size="large" /></div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <Statistic title="Total Payouts (period)" value={`₮${totalEarnings.toLocaleString()}`} className="[&_.ant-statistic-content-value]{color:#16a34a}" />
              </Card>
              <Card>
                <Statistic title="Completed Deliveries" value={total} />
              </Card>
              <Card>
                <Statistic
                  title="Avg Payout"
                  value={total > 0 ? `₮${(totalEarnings / total).toFixed(0)}` : "₮0"}
                />
              </Card>
            </div>

            {/* Weekly summary */}
            <Card title="Weekly Summary">
              <Table
                dataSource={weeklySummaries}
                columns={weeklyColumns}
                rowKey="week"
                pagination={false}
                size="small"
              />
            </Card>

            {/* Transaction ledger */}
            <Card
              title="Transaction Ledger"
              extra={
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportCSV} disabled={rows.length === 0}>
                  Export CSV
                </Button>
              }
            >
              <Table
                dataSource={rows}
                columns={ledgerColumns}
                rowKey="id"
                loading={loading}
                scroll={{ x: "max-content" }}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total,
                  showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} transactions`,
                  onChange: (p) => {
                    setPage(p);
                    if (orgId) fetchData(orgId, p, dateRange);
                  },
                }}
              />
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
