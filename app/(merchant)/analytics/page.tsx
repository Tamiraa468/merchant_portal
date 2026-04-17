"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Typography,
  Select,
  Statistic,
  Table,
  Spin,
  App,
} from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import { PageHeader } from "@/components/ui";

const { Text } = Typography;

type Period = "7d" | "30d" | "90d" | "1y";

interface DailyStat {
  date: string;
  tasks: number;
  revenue: number;
}

interface TopProduct {
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

interface OpsMetric {
  label: string;
  value: string | number;
  description: string;
}

export default function AnalyticsPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [opsMetrics, setOpsMetrics] = useState<OpsMetric[]>([]);
  const [summary, setSummary] = useState({
    totalTasks: 0,
    completedTasks: 0,
    cancelledTasks: 0,
    totalRevenue: 0,
    avgRevenue: 0,
  });

  const periodDays: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

  const fetchAnalytics = useCallback(
    async (oid: string, p: Period) => {
      setLoading(true);
      try {
        const days = periodDays[p];
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: tasks } = await supabase
          .from("delivery_tasks")
          .select("id, status, created_at, completed_at, delivery_fee")
          .eq("org_id", oid)
          .gte("created_at", since)
          .order("created_at", { ascending: true });

        const taskList = tasks ?? [];

        const byDate: Record<string, { tasks: number; revenue: number }> = {};
        taskList.forEach((t) => {
          const date = t.created_at.slice(0, 10);
          if (!byDate[date]) byDate[date] = { tasks: 0, revenue: 0 };
          byDate[date].tasks += 1;
        });

        const { data: earnings } = await supabase
          .from("courier_earnings")
          .select("amount, created_at, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", oid)
          .gte("created_at", since);

        (earnings ?? []).forEach((e) => {
          const date = e.created_at.slice(0, 10);
          if (!byDate[date]) byDate[date] = { tasks: 0, revenue: 0 };
          byDate[date].revenue += e.amount ?? 0;
        });

        const stats: DailyStat[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const date = d.toISOString().slice(0, 10);
          stats.push({
            date,
            tasks: byDate[date]?.tasks ?? 0,
            revenue: byDate[date]?.revenue ?? 0,
          });
        }
        setDailyStats(stats);

        const completed = taskList.filter((t) => t.status === "completed");
        const cancelled = taskList.filter((t) => t.status === "cancelled");
        const totalRevenue = (earnings ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
        setSummary({
          totalTasks: taskList.length,
          completedTasks: completed.length,
          cancelledTasks: cancelled.length,
          totalRevenue,
          avgRevenue: completed.length > 0 ? totalRevenue / completed.length : 0,
        });

        const { data: items } = await supabase
          .from("task_items")
          .select("quantity, product:products(name, price), task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", oid);

        const productMap: Record<string, { total_qty: number; total_revenue: number }> = {};
        (items ?? []).forEach((item) => {
          const prod = Array.isArray(item.product) ? item.product[0] : item.product;
          const name =
            (prod as { name?: string; price?: number } | null)?.name ?? "Тодорхойгүй";
          const price = (prod as { name?: string; price?: number } | null)?.price ?? 0;
          if (!productMap[name]) productMap[name] = { total_qty: 0, total_revenue: 0 };
          productMap[name].total_qty += item.quantity ?? 0;
          productMap[name].total_revenue += (item.quantity ?? 0) * price;
        });
        const topProds = Object.entries(productMap)
          .map(([product_name, v]) => ({ product_name, ...v }))
          .sort((a, b) => b.total_qty - a.total_qty)
          .slice(0, 10);
        setTopProducts(topProds);

        const cancellationRate =
          taskList.length > 0
            ? ((cancelled.length / taskList.length) * 100).toFixed(1)
            : "0.0";
        setOpsMetrics([
          {
            label: "Цуцлалтын хувь",
            value: `${cancellationRate}%`,
            description: "Нийт даалгаврын цуцлагдсан хувь",
          },
          {
            label: "Дуусгалтын хувь",
            value:
              taskList.length > 0
                ? `${((completed.length / taskList.length) * 100).toFixed(1)}%`
                : "0%",
            description: "ePOD-ээр баталгаажсан",
          },
          {
            label: "Дундаж хүргэлтийн орлого",
            value: `₮${summary.avgRevenue.toLocaleString()}`,
            description: "Жолоочийн дундаж орлого",
          },
          {
            label: "Идэвхтэй даалгавар",
            value: taskList.filter((t) =>
              ["published", "assigned", "picked_up"].includes(t.status),
            ).length,
            description: "Одоогоор үргэлжилж буй",
          },
        ]);
      } catch {
        message.error("Аналитик ачаалахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        fetchAnalytics(profile.org_id, period);
      }
    };
    init();
  }, [supabase, period, fetchAnalytics]);

  useEffect(() => {
    if (orgId) fetchAnalytics(orgId, period);
  }, [period, orgId, fetchAnalytics]);

  const topProductColumns: ColumnsType<TopProduct> = [
    { title: "Бүтээгдэхүүн", dataIndex: "product_name", key: "name" },
    { title: "Зарагдсан тоо", dataIndex: "total_qty", key: "qty", align: "right" },
    {
      title: "Орлого",
      dataIndex: "total_revenue",
      key: "revenue",
      render: (v: number) => `₮${v.toLocaleString()}`,
      align: "right",
    },
  ];

  const periodSelect = (
    <Select
      value={period}
      onChange={(v) => setPeriod(v)}
      options={[
        { value: "7d", label: "7 хоног" },
        { value: "30d", label: "30 хоног" },
        { value: "90d", label: "90 хоног" },
        { value: "1y", label: "1 жил" },
      ]}
      style={{ width: 150 }}
      aria-label="Хугацаа"
    />
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Аналитик" action={periodSelect} />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: "Нийт даалгавар", value: summary.totalTasks },
              { title: "Дууссан", value: summary.completedTasks },
              {
                title: "Нийт орлого",
                value: `₮${summary.totalRevenue.toLocaleString()}`,
              },
              {
                title: "Дундаж хүргэлтийн үнэ",
                value: `₮${summary.avgRevenue.toFixed(0)}`,
              },
            ].map((s) => (
              <Card key={s.title} className="text-center">
                <Statistic title={s.title} value={s.value} />
              </Card>
            ))}
          </div>

          <Card title="Өдөр тутмын даалгавар">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="tasks"
                  stroke="#FF6B35"
                  strokeWidth={2}
                  dot={false}
                  name="Даалгавар"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Өдөр тутмын орлого (₮)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis />
                <RechartsTooltip
                  formatter={(v) => `₮${Number(v).toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#16a34a" name="Орлого (₮)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Үйл ажиллагааны үзүүлэлт">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {opsMetrics.map((m) => (
                <div
                  key={m.label}
                  className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {m.value}
                  </div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">
                    {m.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {m.description}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Хамгийн их зарагдсан бүтээгдэхүүн">
            {topProducts.length > 0 ? (
              <Table
                dataSource={topProducts}
                columns={topProductColumns}
                rowKey="product_name"
                pagination={false}
                size="small"
              />
            ) : (
              <Text type="secondary">
                Энэ хугацаанд бүтээгдэхүүний мэдээлэл байхгүй.
              </Text>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
