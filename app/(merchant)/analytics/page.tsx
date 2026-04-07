"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Card,
  Typography,
  Select,
  Space,
  Statistic,
  Table,
  Spin,
  App,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
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

const { Title, Text } = Typography;

type Period = "7d" | "30d" | "90d";

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

  const periodDays: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };

  const fetchAnalytics = useCallback(async (oid: string, p: Period) => {
    setLoading(true);
    try {
      const days = periodDays[p];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Fetch tasks in range
      const { data: tasks } = await supabase
        .from("delivery_tasks")
        .select("id, status, created_at, completed_at, delivery_fee")
        .eq("org_id", oid)
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      const taskList = tasks ?? [];

      // Daily task counts
      const byDate: Record<string, { tasks: number; revenue: number }> = {};
      taskList.forEach((t) => {
        const date = t.created_at.slice(0, 10);
        if (!byDate[date]) byDate[date] = { tasks: 0, revenue: 0 };
        byDate[date].tasks += 1;
      });

      // Fetch earnings in range
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

      // Fill in missing dates
      const stats: DailyStat[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const date = d.toISOString().slice(0, 10);
        stats.push({ date, tasks: byDate[date]?.tasks ?? 0, revenue: byDate[date]?.revenue ?? 0 });
      }
      setDailyStats(stats);

      // Summary
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

      // Top products by qty from task_items
      const { data: items } = await supabase
        .from("task_items")
        .select("qty, product:products(name, price), task:delivery_tasks!task_id(org_id)")
        .eq("task.org_id", oid);

      const productMap: Record<string, { total_qty: number; total_revenue: number }> = {};
      (items ?? []).forEach((item) => {
        const prod = Array.isArray(item.product) ? item.product[0] : item.product;
        const name = (prod as { name?: string; price?: number } | null)?.name ?? "Unknown";
        const price = (prod as { name?: string; price?: number } | null)?.price ?? 0;
        if (!productMap[name]) productMap[name] = { total_qty: 0, total_revenue: 0 };
        productMap[name].total_qty += item.qty ?? 0;
        productMap[name].total_revenue += (item.qty ?? 0) * price;
      });
      const topProds = Object.entries(productMap)
        .map(([product_name, v]) => ({ product_name, ...v }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 10);
      setTopProducts(topProds);

      // Ops metrics
      const cancellationRate = taskList.length > 0
        ? ((cancelled.length / taskList.length) * 100).toFixed(1)
        : "0.0";
      setOpsMetrics([
        { label: "Cancellation Rate", value: `${cancellationRate}%`, description: "Tasks cancelled out of total" },
        { label: "Completion Rate", value: taskList.length > 0 ? `${((completed.length / taskList.length) * 100).toFixed(1)}%` : "0%", description: "Tasks completed via ePOD" },
        { label: "Avg Revenue / Delivery", value: `₮${summary.avgRevenue.toLocaleString()}`, description: "Average courier earnings" },
        { label: "Active Tasks", value: taskList.filter((t) => ["published", "assigned", "picked_up"].includes(t.status)).length, description: "Currently in progress" },
      ]);
    } catch {
      message.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, message]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
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
    { title: "Product", dataIndex: "product_name", key: "name" },
    { title: "Qty Sold", dataIndex: "total_qty", key: "qty", align: "right" },
    {
      title: "Revenue",
      dataIndex: "total_revenue",
      key: "revenue",
      render: (v: number) => `₮${v.toLocaleString()}`,
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
              <Title level={4} className="mb-0!">Analytics</Title>
            </div>
            <Select
              value={period}
              onChange={(v) => setPeriod(v)}
              options={[
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "90d", label: "Last 90 days" },
              ]}
              style={{ width: 150 }}
              aria-label="Time period"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spin size="large" />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: "Total Tasks", value: summary.totalTasks },
                { title: "Completed", value: summary.completedTasks },
                { title: "Total Revenue", value: `₮${summary.totalRevenue.toLocaleString()}` },
                { title: "Avg per Delivery", value: `₮${summary.avgRevenue.toFixed(0)}` },
              ].map((s) => (
                <Card key={s.title} className="text-center">
                  <Statistic title={s.title} value={s.value} />
                </Card>
              ))}
            </div>

            {/* Line chart: daily tasks */}
            <Card title="Daily Tasks Created">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="tasks" stroke="#2563eb" strokeWidth={2} dot={false} name="Tasks" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Bar chart: daily revenue */}
            <Card title="Daily Revenue (₮)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis />
                  <RechartsTooltip formatter={(v) => `₮${Number(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#16a34a" name="Revenue (₮)" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Operations metrics */}
            <Card title="Operations Metrics">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {opsMetrics.map((m) => (
                  <div key={m.label} className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{m.value}</div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{m.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top products */}
            <Card title="Top-Selling Products">
              {topProducts.length > 0 ? (
                <Table
                  dataSource={topProducts}
                  columns={topProductColumns}
                  rowKey="product_name"
                  pagination={false}
                  size="small"
                />
              ) : (
                <Text type="secondary">No product data for this period.</Text>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
