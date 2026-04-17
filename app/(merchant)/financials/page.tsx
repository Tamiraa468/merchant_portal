"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  Typography,
  Card,
  Statistic,
  Space,
  Tag,
  App,
  Spin,
  DatePicker,
  Button as AntButton,
} from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { PageHeader } from "@/components/ui";

const { Text } = Typography;
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

  const fetchData = useCallback(
    async (oid: string, currentPage: number, range: [Dayjs, Dayjs]) => {
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const since = range[0].startOf("day").toISOString();
      const until = range[1].endOf("day").toISOString();

      try {
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
        const normalized = (data ?? []).map((r) => ({
          ...r,
          task: Array.isArray(r.task) ? r.task[0] ?? null : r.task,
        }));
        setRows(normalized as EarningsRow[]);
        setTotal(count ?? 0);

        const { data: allRows } = await supabase
          .from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", oid)
          .gte("created_at", since)
          .lte("created_at", until);

        const total_ = (allRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
        setTotalEarnings(total_);

        const weekMap: Record<string, WeeklySummary> = {};
        (allRows ?? []).forEach((r) => {
          const created = (r as { created_at?: string }).created_at ?? "";
          const weekStart = dayjs(created).startOf("week").format("MMM D");
          if (!weekMap[weekStart])
            weekMap[weekStart] = { week: weekStart, payouts: 0, deliveries: 0 };
          weekMap[weekStart].payouts += r.amount ?? 0;
          weekMap[weekStart].deliveries += 1;
        });
        setWeeklySummaries(Object.values(weekMap).reverse().slice(0, 8));
      } catch {
        message.error("Санхүү ачаалахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    [supabase, message],
  );

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profile?.org_id) {
        setOrgId(profile.org_id);
        fetchData(profile.org_id, 1, dateRange);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleExportCSV = () => {
    const headers = [
      "Огноо",
      "Даалгаврын ID",
      "Хүлээн авагч",
      "Хүргэлтийн хөлс (₮)",
      "Жолоочийн төлбөр (₮)",
      "Төлөв",
    ];
    const csvRows = rows.map((r) => [
      new Date(r.created_at).toLocaleDateString("mn-MN"),
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
      title: "Огноо",
      dataIndex: "created_at",
      key: "date",
      render: (d: string) => new Date(d).toLocaleDateString("mn-MN"),
    },
    {
      title: "Хүлээн авагч",
      key: "receiver",
      render: (_, r) => r.task?.receiver_name ?? <Text type="secondary">—</Text>,
    },
    {
      title: "Хүргэлтийн хөлс",
      key: "fee",
      render: (_, r) => `₮${(r.task?.delivery_fee ?? 0).toLocaleString()}`,
      align: "right",
      responsive: ["md"],
    },
    {
      title: "Жолоочийн төлбөр",
      dataIndex: "amount",
      key: "amount",
      render: (v: number) => (
        <span className="font-semibold text-green-600">
          ₮{v.toLocaleString()}
        </span>
      ),
      align: "right",
    },
    {
      title: "Төлөв",
      key: "status",
      render: (_, r) => <Tag color="green">{r.task?.status ?? "completed"}</Tag>,
      responsive: ["lg"],
    },
  ];

  const weeklyColumns: ColumnsType<WeeklySummary> = [
    { title: "7 хоног", dataIndex: "week", key: "week" },
    { title: "Хүргэлт", dataIndex: "deliveries", key: "deliveries", align: "right" },
    {
      title: "Нийт төлбөр",
      dataIndex: "payouts",
      key: "payouts",
      render: (v: number) => (
        <span className="font-semibold text-green-600">
          ₮{v.toLocaleString()}
        </span>
      ),
      align: "right",
    },
  ];

  const headerAction = (
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
      <AntButton
        icon={<DownloadOutlined />}
        onClick={handleExportCSV}
        disabled={rows.length === 0}
      >
        CSV татаж авах
      </AntButton>
    </Space>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Санхүү" action={headerAction} />

      {loading && page === 1 ? (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <Statistic
                title="Нийт төлбөр (хугацаанд)"
                value={`₮${totalEarnings.toLocaleString()}`}
              />
            </Card>
            <Card>
              <Statistic title="Дууссан хүргэлт" value={total} />
            </Card>
            <Card>
              <Statistic
                title="Дундаж төлбөр"
                value={total > 0 ? `₮${(totalEarnings / total).toFixed(0)}` : "₮0"}
              />
            </Card>
          </div>

          <Card title="7 хоногийн хураангуй">
            {weeklySummaries.length > 0 ? (
              <Table
                dataSource={weeklySummaries}
                columns={weeklyColumns}
                rowKey="week"
                pagination={false}
                size="small"
              />
            ) : (
              <Text type="secondary">Мэдээлэл байхгүй</Text>
            )}
          </Card>

          <Card
            title="Гүйлгээний бүртгэл"
            extra={
              <AntButton
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                disabled={rows.length === 0}
              >
                CSV татаж авах
              </AntButton>
            }
          >
            <Table
              dataSource={rows}
              columns={ledgerColumns}
              rowKey="id"
              loading={loading}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: "Мэдээлэл байхгүй" }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} гүйлгээ`,
                onChange: (p) => {
                  setPage(p);
                  if (orgId) fetchData(orgId, p, dateRange);
                },
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
