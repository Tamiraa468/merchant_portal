"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { ColumnsType } from "antd/es/table";
import {
  Package,
  Truck,
  Wallet,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
  Plus,
  ClipboardList,
  ShoppingBag,
  BarChart3,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  DataTable,
  StatusPill,
  Badge,
  EmptyState,
  Skeleton,
  type StatusKey,
} from "@/components/ui";
import type { Profile, Order, OrderItem } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface DashboardStats {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  todayRevenue: number;
  totalRevenue: number;
  productsCount: number;
  totalTasksYesterday: number;
  revenueYesterday: number;
}

type OrderRow = Order & { order_items?: OrderItem[] };

const ORDERS_PAGE_SIZE = 10;

const ROLE_BADGE: Record<string, string> = {
  admin: "Администратор",
  org_user: "Гүйлгээний менежер",
  merchant: "Худалдаачин",
  courier: "Хүргэлтийн ажилтан",
  customer: "Үйлчлүүлэгч",
};

const QUICK_ACTIONS: { href: string; Icon: LucideIcon; label: string }[] = [
  { href: "/tasks/new",  Icon: Plus,           label: "Шинэ даалгавар" },
  { href: "/tasks",      Icon: ClipboardList,  label: "Даалгавар" },
  { href: "/orders",     Icon: Package,        label: "Захиалга" },
  { href: "/products",   Icon: ShoppingBag,    label: "Бүтээгдэхүүн" },
  { href: "/analytics",  Icon: BarChart3,      label: "Аналитик" },
  { href: "/settings",   Icon: SettingsIcon,   label: "Тохиргоо" },
];

function orderStatusKey(status: Order["status"]): StatusKey {
  switch (status) {
    case "paid":
    case "preparing":
    case "ready_for_delivery":
    case "pending_payment":
      return "pending";
    case "cancelled":
      return "cancelled";
    default:
      return "completed";
  }
}

function formatTugrik(n: number): string {
  return `₮${n.toLocaleString("mn-MN")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("mn-MN", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

export default function DashboardPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) { setError("Хэрэглэгчийн мэдээлэл олдсонгүй"); return; }
        setUser(user);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        setProfile(profileData);
      } catch {
        setError("Хэрэглэгчийн мэдээлэл ачаалахад алдаа гарлаа");
      } finally {
        setUserLoading(false);
      }
    };

    fetchUserData();
  }, [supabase]);

  const fetchStats = async (orgId: string) => {
    setStatsLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const todayIso = today.toISOString();
      const yesterdayIso = yesterday.toISOString();

      const [
        totalTasksRes,
        activeTasksRes,
        completedTasksRes,
        productsRes,
        totalRevenueRes,
        todayRevenueRes,
        yesterdayTasksRes,
        yesterdayRevenueRes,
      ] = await Promise.all([
        supabase.from("delivery_tasks").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("delivery_tasks").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).in("status", ["published", "assigned", "picked_up"]),
        supabase.from("delivery_tasks").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).eq("status", "completed"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", orgId),
        supabase.from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id, completed_at)")
          .eq("task.org_id", orgId).gte("created_at", todayIso),
        supabase.from("delivery_tasks").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).gte("created_at", yesterdayIso).lt("created_at", todayIso),
        supabase.from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", orgId).gte("created_at", yesterdayIso).lt("created_at", todayIso),
      ]);

      const sumAmounts = (rows: { amount: number }[] | null) =>
        (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

      setStats({
        totalTasks: totalTasksRes.count ?? 0,
        activeTasks: activeTasksRes.count ?? 0,
        completedTasks: completedTasksRes.count ?? 0,
        productsCount: productsRes.count ?? 0,
        totalRevenue: sumAmounts(totalRevenueRes.data as { amount: number }[]),
        todayRevenue: sumAmounts(todayRevenueRes.data as { amount: number }[]),
        totalTasksYesterday: yesterdayTasksRes.count ?? 0,
        revenueYesterday: sumAmounts(yesterdayRevenueRes.data as { amount: number }[]),
      });
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchOrders = async (orgId: string, page: number) => {
    setOrdersLoading(true);
    try {
      const from = (page - 1) * ORDERS_PAGE_SIZE;
      const to = from + ORDERS_PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("orders")
        .select("*, order_items(*)", { count: "exact" })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(from, to);
      setOrders(data ?? []);
      setOrdersTotal(count ?? 0);
    } catch {
      // ignore
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.org_id) return;
    const orgId = profile.org_id;

    fetchStats(orgId);
    fetchOrders(orgId, ordersPage);

    const channel = supabase
      .channel(`dashboard-${orgId}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "delivery_tasks", filter: `org_id=eq.${orgId}` },
          () => fetchStats(orgId))
      .on("postgres_changes",
          { event: "*", schema: "public", table: "courier_earnings" },
          () => fetchStats(orgId))
      .on("postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `org_id=eq.${orgId}` },
          () => fetchOrders(orgId, ordersPage))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id, ordersPage]);

  const todayVsYesterdayTasks = (stats?.totalTasksYesterday ?? 0) > 0
    ? (((stats?.totalTasks ?? 0) - (stats?.totalTasksYesterday ?? 0)) / (stats?.totalTasksYesterday ?? 1)) * 100
    : null;
  const todayVsYesterdayRevenue = (stats?.revenueYesterday ?? 0) > 0
    ? (((stats?.todayRevenue ?? 0) - (stats?.revenueYesterday ?? 0)) / (stats?.revenueYesterday ?? 1)) * 100
    : null;

  const orderColumns: ColumnsType<OrderRow> = [
    {
      title: "Үйлчлүүлэгчийн нэр",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (v: string) => <span className="font-medium">{v || "—"}</span>,
    },
    {
      title: "Дүн",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (v: number) => <span>{formatTugrik(v ?? 0)}</span>,
    },
    {
      title: "Бараа",
      key: "items",
      render: (_, row) => {
        const items = row.order_items ?? [];
        const first = items[0]?.product_name ?? "—";
        const extra = items.length > 1 ? ` +${items.length - 1}` : "";
        return <span className="text-[#374151] truncate">{first}{extra}</span>;
      },
    },
    {
      title: "Дэлгүүр/Зах",
      key: "store",
      render: () => <span className="text-[#6B7280]">Үндсэн дэлгүүр</span>,
    },
    {
      title: "Огноо",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string) => <span className="text-[#6B7280]">{formatDate(v)}</span>,
    },
    {
      title: "Төлөв",
      dataIndex: "status",
      key: "status",
      render: (status: Order["status"]) => <StatusPill status={orderStatusKey(status)} />,
    },
    {
      title: "Дэлгэрэнгүй",
      key: "view",
      render: (_, row) => (
        <Link
          href={`/orders?id=${row.id}`}
          className="text-[#FF6B35] font-medium hover:underline"
        >
          Дэлгэрэнгүй
        </Link>
      ),
    },
  ];

  const userName = profile?.full_name || user?.email?.split("@")[0] || "Хэрэглэгч";
  const initial = userName.charAt(0).toUpperCase();
  const roleLabel = profile?.role ? ROLE_BADGE[profile.role] ?? profile.role : null;
  const showOrdersSkeleton = ordersLoading && orders.length === 0;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page chrome — always solid */}
      <PageHeader title="Хяналтын самбар" />

      {/* Welcome card */}
      {userLoading ? (
        <WelcomeCardSkeleton />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8A5C]
                         flex items-center justify-center text-white text-xl font-bold shrink-0"
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#111827]">Тавтай морилно уу!</h2>
              <p className="text-sm text-[#6B7280] truncate">{user?.email}</p>
              {roleLabel && <Badge tone="accent" className="mt-2">{roleLabel}</Badge>}
            </div>
          </div>
        </div>
      )}

      {error && !userLoading && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <EmptyState title="Алдаа гарлаа" description={error} />
        </div>
      )}

      {/* Primary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Нийт даалгавар"
          value={stats?.totalTasks ?? 0}
          loading={statsLoading}
          Icon={Package}
          tone="purple"
          trend={todayVsYesterdayTasks}
          trendLabel="өчигдрөөс"
        />
        <StatCard
          label="Идэвхтэй хүргэлт"
          value={stats?.activeTasks ?? 0}
          loading={statsLoading}
          Icon={Truck}
          tone="blue"
        />
        <StatCard
          label="Өнөөдрийн орлого"
          value={formatTugrik(stats?.todayRevenue ?? 0)}
          loading={statsLoading}
          Icon={Wallet}
          tone="orange"
          trend={todayVsYesterdayRevenue}
          trendLabel="өчигдрөөс"
        />
        <StatCard
          label="Бүтээгдэхүүн"
          value={stats?.productsCount ?? 0}
          loading={statsLoading}
          Icon={ShoppingCart}
          tone="green"
        />
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          size="wide"
          label="Дууссан хүргэлт"
          value={(stats?.completedTasks ?? 0).toLocaleString("mn-MN")}
          Icon={CheckCircle2}
          tone="green"
          loading={statsLoading}
        />
        <StatCard
          size="wide"
          label="Нийт орлого"
          value={formatTugrik(stats?.totalRevenue ?? 0)}
          Icon={TrendingUp}
          tone="orange"
          loading={statsLoading}
        />
      </div>

      {/* Quick actions — static chrome */}
      <section className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Шуурхай үйлдлүүд</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl
                         bg-[#F7F8FA] hover:bg-[#FFF1EA] border border-transparent hover:border-[#FFD7C2]
                         transition-all duration-150"
            >
              <span className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] group-hover:border-[#FFD7C2]
                               flex items-center justify-center text-[#FF6B35] transition-colors">
                <a.Icon className="w-5 h-5" />
              </span>
              <span className="text-xs font-medium text-[#374151] text-center">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent orders */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">Сүүлийн захиалгууд</h2>
          <Link href="/orders" className="text-sm font-medium text-[#FF6B35] hover:underline">
            Бүгдийг харах
          </Link>
        </div>
        {showOrdersSkeleton ? (
          <OrdersTableSkeleton />
        ) : (
          <DataTable<OrderRow>
            columns={orderColumns}
            data={orders}
            rowKey="id"
            loading={ordersLoading}
            pagination={{
              current: ordersPage,
              pageSize: ORDERS_PAGE_SIZE,
              total: ordersTotal,
              onChange: setOrdersPage,
            }}
            emptyTitle="Захиалга алга байна"
            emptyDescription="Шинэ захиалга ирэхэд энд харагдана."
          />
        )}
      </section>

      {/* Account info */}
      <section className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Бүртгэлийн мэдээлэл</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoTile label="Имэйл" value={user?.email} loading={userLoading} />
          <InfoTile label="Хэрэглэгчийн ID" value={user?.id} loading={userLoading} mono />
        </dl>
      </section>
    </div>
  );
}

// ── Region skeletons ───────────────────────────────────────────

function WelcomeCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
      <div className="flex items-center gap-4">
        <Skeleton width={56} height={56} radius="9999px" />
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton width={180} height={20} />
          <Skeleton width={220} height={14} />
          <Skeleton width={120} height={20} radius={6} />
        </div>
      </div>
    </div>
  );
}

const ORDER_COL_WIDTHS = [200, 100, 160, 140, 100, 110, 90];

function OrdersTableSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header bar */}
      <div className="hidden md:flex items-center gap-4 px-6 py-3.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
        {ORDER_COL_WIDTHS.map((w, i) => (
          <Skeleton key={i} width={w} height={10} />
        ))}
      </div>
      {/* 5 row skeletons */}
      <div className="divide-y divide-[#F3F4F6]">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-6 py-4">
            {ORDER_COL_WIDTHS.map((w, c) => (
              <Skeleton key={c} width={w} height={14} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface InfoTileProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  loading?: boolean;
}

function InfoTile({ label, value, mono, loading }: InfoTileProps) {
  return (
    <div className="bg-[#F7F8FA] rounded-lg p-4 border border-[#E5E7EB]">
      <dt className="text-[11px] text-[#6B7280] uppercase tracking-wide font-medium">{label}</dt>
      <dd
        className={`text-[#111827] font-medium mt-1.5 truncate ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {loading ? <Skeleton width="60%" height={14} /> : (value ?? "—")}
      </dd>
    </div>
  );
}

// ── PageSkeleton (full layout-mirroring fallback) ──────────────

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page header — static title kept solid */}
      <PageHeader title="Хяналтын самбар" />

      {/* Welcome card */}
      <WelcomeCardSkeleton />

      {/* Primary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => <StatCardSkeleton key={i} wide />)}
      </div>

      {/* Quick actions — static labels kept solid */}
      <section className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Шуурхай үйлдлүүд</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <div
              key={a.label}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-[#F7F8FA] border border-transparent"
            >
              <span className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-[#FF6B35]">
                <a.Icon className="w-5 h-5" />
              </span>
              <span className="text-xs font-medium text-[#374151] text-center">{a.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent orders */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">Сүүлийн захиалгууд</h2>
          <span className="text-sm font-medium text-[#FF6B35]">Бүгдийг харах</span>
        </div>
        <OrdersTableSkeleton />
      </section>

      {/* Account info */}
      <section className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
        <h2 className="text-lg font-semibold text-[#111827] mb-4">Бүртгэлийн мэдээлэл</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoTile label="Имэйл" value={null} loading />
          <InfoTile label="Хэрэглэгчийн ID" value={null} loading mono />
        </dl>
      </section>
    </div>
  );
}

function StatCardSkeleton({ wide = false }: { wide?: boolean }) {
  if (wide) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6 flex items-center gap-5">
        <Skeleton width={56} height={56} radius={16} />
        <div className="flex-1 space-y-2">
          <Skeleton width={120} height={10} />
          <Skeleton width={160} height={26} />
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-6">
      <Skeleton width={44} height={44} radius="9999px" />
      <div className="mt-4 space-y-2">
        <Skeleton width={110} height={10} />
        <Skeleton width={90} height={26} />
      </div>
    </div>
  );
}
