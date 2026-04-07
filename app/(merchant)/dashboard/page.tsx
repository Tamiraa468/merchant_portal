"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/LogoutButton";
import Link from "next/link";
import { Tag, Spin, Badge } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface DashboardStats {
  totalTasks: number;
  activeTasks: number;    // published + assigned + picked_up
  completedTasks: number;
  todayRevenue: number;   // sum of courier_earnings where task completed today
  totalRevenue: number;   // all-time
  productsCount: number;
  totalTasksYesterday: number;
  revenueYesterday: number;
}

const navLinks = [
  { href: "/tasks", label: "Delivery Tasks" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/analytics", label: "Analytics" },
  { href: "/financials", label: "Financials" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) { setError("No user found"); return; }
        setUser(user);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        setProfile(profileData);
      } catch {
        setError("Failed to load user data");
      } finally {
        setLoading(false);
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
        // Total tasks
        supabase
          .from("delivery_tasks")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),

        // Active tasks: published, assigned, picked_up
        supabase
          .from("delivery_tasks")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("status", ["published", "assigned", "picked_up"]),

        // Completed tasks
        supabase
          .from("delivery_tasks")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "completed"),

        // Products
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),

        // Total courier earnings for this org
        supabase
          .from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", orgId),

        // Today's earnings
        supabase
          .from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id, completed_at)")
          .eq("task.org_id", orgId)
          .gte("created_at", todayIso),

        // Yesterday's task count (for trend)
        supabase
          .from("delivery_tasks")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("created_at", yesterdayIso)
          .lt("created_at", todayIso),

        // Yesterday's earnings (for trend)
        supabase
          .from("courier_earnings")
          .select("amount, task:delivery_tasks!task_id(org_id)")
          .eq("task.org_id", orgId)
          .gte("created_at", yesterdayIso)
          .lt("created_at", todayIso),
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
      // Stats are non-critical; just leave them at defaults
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch stats once org_id is available, then subscribe for live updates
  useEffect(() => {
    if (!profile?.org_id) return;

    const orgId = profile.org_id;
    fetchStats(orgId);

    const channel = supabase
      .channel(`dashboard-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_tasks", filter: `org_id=eq.${orgId}` }, () => fetchStats(orgId))
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_earnings" }, () => fetchStats(orgId))
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Spin size="large" />
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <LogoutButton className="w-full" />
        </div>
      </div>
    );
  }

  const todayVsYesterdayTasks = (stats?.totalTasksYesterday ?? 0) > 0
    ? (((stats?.totalTasks ?? 0) - (stats?.totalTasksYesterday ?? 0)) / (stats?.totalTasksYesterday ?? 1)) * 100
    : null;
  const todayVsYesterdayRevenue = (stats?.revenueYesterday ?? 0) > 0
    ? (((stats?.todayRevenue ?? 0) - (stats?.revenueYesterday ?? 0)) / (stats?.revenueYesterday ?? 1)) * 100
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo + nav */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <span className="font-bold text-gray-900 dark:text-white hidden sm:block">
                  Merchant
                </span>
              </div>
              <nav className="hidden md:flex items-center gap-4" aria-label="Main navigation">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-sm font-medium"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs">
                <Badge status={isLive ? "success" : "default"} />
                {isLive && <span className="text-green-600 hidden sm:inline"><WifiOutlined /> Live</span>}
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600
                         flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              aria-hidden="true"
            >
              {user?.email?.charAt(0).toUpperCase() ?? "M"}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back!</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{user?.email}</p>
              {profile?.role && (
                <Tag color="blue" className="mt-1 capitalize">{profile.role}</Tag>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Tasks"
            value={stats?.totalTasks ?? 0}
            loading={statsLoading}
            color="blue"
            trend={todayVsYesterdayTasks}
            trendLabel="vs yesterday"
            icon="📦"
          />
          <StatCard
            title="Active Deliveries"
            value={stats?.activeTasks ?? 0}
            loading={statsLoading}
            color="orange"
            icon="🚚"
          />
          <StatCard
            title="Today's Revenue"
            value={`₮${(stats?.todayRevenue ?? 0).toLocaleString()}`}
            loading={statsLoading}
            color="green"
            trend={todayVsYesterdayRevenue}
            trendLabel="vs yesterday"
            icon="💰"
          />
          <StatCard
            title="Products"
            value={stats?.productsCount ?? 0}
            loading={statsLoading}
            color="purple"
            icon="🛒"
          />
        </div>

        {/* Secondary stats row */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
            <p className="text-xs text-gray-500 uppercase mb-1">Completed Deliveries</p>
            {statsLoading ? (
              <div className="animate-pulse h-7 w-16 bg-gray-200 rounded mt-1" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.completedTasks ?? 0}
              </p>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
            <p className="text-xs text-gray-500 uppercase mb-1">All-time Revenue</p>
            {statsLoading ? (
              <div className="animate-pulse h-7 w-24 bg-gray-200 rounded mt-1" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ₮{(stats?.totalRevenue ?? 0).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { href: "/tasks/new", icon: "➕", label: "New Task", color: "text-blue-600" },
              { href: "/tasks",     icon: "🚚", label: "Tasks",    color: "text-purple-600" },
              { href: "/orders",    icon: "📋", label: "Orders",   color: "text-green-600" },
              { href: "/products",  icon: "🛒", label: "Products", color: "text-orange-600" },
              { href: "/analytics", icon: "📊", label: "Analytics", color: "text-indigo-600" },
              { href: "/settings",  icon: "⚙️", label: "Settings", color: "text-gray-600" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col items-center justify-center p-4 rounded-xl
                           bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600
                           transition-colors gap-2"
              >
                <span className="text-2xl" aria-hidden="true">{action.icon}</span>
                <span className={`text-xs font-medium ${action.color} dark:text-gray-200`}>
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Account Information
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Email", value: user?.email },
              { label: "User ID", value: user?.id, mono: true },
              { label: "Role", value: profile?.role ?? "Not set", capitalize: true },
              {
                label: "Member Since",
                value: user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                  : "Unknown",
              },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase">{item.label}</dt>
                <dd
                  className={`text-gray-900 dark:text-white font-medium mt-1 truncate
                    ${item.mono ? "font-mono text-sm" : ""}
                    ${item.capitalize ? "capitalize" : ""}`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  loading: boolean;
  color: "blue" | "green" | "orange" | "purple";
  trend?: number | null;
  trendLabel?: string;
  icon: string;
}

const colorMap = {
  blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600",
  green: "bg-green-100 dark:bg-green-900/20 text-green-600",
  orange: "bg-orange-100 dark:bg-orange-900/20 text-orange-600",
  purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600",
};

function StatCard({ title, value, loading, color, trend, trendLabel, icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{title}</p>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${colorMap[color]}`}>
          <span aria-hidden="true">{icon}</span>
        </div>
      </div>
      {loading ? (
        <div className="animate-pulse h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      )}
      {trend !== null && trend !== undefined && !loading && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
          {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          <span>{Math.abs(trend).toFixed(1)}% {trendLabel}</span>
        </div>
      )}
    </div>
  );
}
