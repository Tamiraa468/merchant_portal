"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/LogoutButton";
import Link from "next/link";
import { Table, Tag, Button, Space, Typography, App, Badge } from "antd";
import {
  PlusOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DeliveryTask, TaskStatus } from "@/types/database";

const { Title } = Typography;

interface DeliveryTaskWithLocations extends Omit<
  DeliveryTask,
  "pickup_location" | "dropoff_location"
> {
  pickup_location: { address_text: string } | null;
  dropoff_location: { address_text: string } | null;
}

const statusColors: Record<TaskStatus, string> = {
  draft: "default",
  created: "default",
  published: "cyan",
  assigned: "orange",
  picked_up: "purple",
  delivered: "green",
  completed: "green",
  cancelled: "red",
  failed: "magenta",
};

const statusLabels: Record<TaskStatus, string> = {
  draft: "Draft",
  created: "Draft",
  published: "Published",
  assigned: "Assigned",
  picked_up: "Picked Up",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

const PAGE_SIZE = 10;

export default function TasksPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [tasks, setTasks] = useState<DeliveryTaskWithLocations[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTasks = useCallback(async (currentPage = 1) => {
    if (!orgId) return;

    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const { data, error, count } = await supabase
        .from("delivery_tasks")
        .select(
          `*,
          pickup_location:locations!pickup_location_id(address_text),
          dropoff_location:locations!dropoff_location_id(address_text)`,
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        message.error("Failed to load delivery tasks");
      } else {
        setTasks(data || []);
        setTotal(count ?? 0);
      }
    } catch {
      message.error("Failed to load delivery tasks");
    } finally {
      setLoading(false);
    }
  }, [supabase, orgId, message]);

  // Get org_id on mount
  useEffect(() => {
    const getOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) setOrgId(profile.org_id);
    };

    getOrgId();
  }, [supabase]);

  // Initial fetch + real-time subscription
  useEffect(() => {
    if (!orgId) return;

    fetchTasks(page);

    // Subscribe to all changes on this org's tasks
    channelRef.current = supabase
      .channel(`tasks-list-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_tasks",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          fetchTasks(page);
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handlePublish = async (taskId: string) => {
    setPublishing(taskId);
    try {
      const { error } = await supabase.rpc("publish_delivery_task", {
        p_task_id: taskId,
      });
      if (error) throw error;
      message.success("Task published! Couriers can now see it.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message :
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      message.error(`Failed to publish: ${msg}`);
    } finally {
      setPublishing(null);
    }
  };

  const columns: ColumnsType<DeliveryTaskWithLocations> = [
    {
      title: "Receiver",
      key: "receiver",
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.receiver_name || "—"}</div>
          <div className="text-gray-500 text-xs">{record.receiver_phone}</div>
        </div>
      ),
    },
    {
      title: "Pickup",
      key: "pickup",
      responsive: ["md"],
      render: (_, record) => (
        <div className="max-w-48 truncate text-sm">
          {record.pickup_location?.address_text || "N/A"}
        </div>
      ),
    },
    {
      title: "Dropoff",
      key: "dropoff",
      responsive: ["md"],
      render: (_, record) => (
        <div className="max-w-48 truncate text-sm">
          {record.dropoff_location?.address_text || "N/A"}
        </div>
      ),
    },
    {
      title: "Fee",
      dataIndex: "delivery_fee",
      key: "delivery_fee",
      render: (fee: number) => (
        <span className="font-semibold text-blue-600">
          ₮{(fee ?? 0).toLocaleString()}
        </span>
      ),
      align: "right" as const,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status] ?? "default"}>
          {statusLabels[status] ?? status}
        </Tag>
      ),
      filters: [
        { text: "Draft", value: "draft" },
        { text: "Published", value: "published" },
        { text: "Assigned", value: "assigned" },
        { text: "Picked Up", value: "picked_up" },
        { text: "Delivered", value: "delivered" },
        { text: "Completed", value: "completed" },
        { text: "Cancelled", value: "cancelled" },
        { text: "Failed", value: "failed" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      responsive: ["lg"],
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space size="small">
          {(record.status === "draft" || record.status === "created") && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={publishing === record.id}
              onClick={() => handlePublish(record.id)}
              aria-label={`Publish task for ${record.receiver_name}`}
            >
              <span className="hidden sm:inline">Publish</span>
            </Button>
          )}
          <Link href={`/tasks/${record.id}`}>
            <Button type="link" size="small">View</Button>
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Back to dashboard"
              >
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="mb-0!">
                Delivery Tasks
              </Title>
              <Badge
                status={isLive ? "success" : "default"}
                title={isLive ? "Live updates active" : "Connecting…"}
              />
              {isLive && (
                <span className="text-xs text-green-600 hidden sm:inline">
                  <WifiOutlined /> Live
                </span>
              )}
            </div>
            <Space wrap>
              <Link href="/tasks/new">
                <Button type="primary" icon={<PlusOutlined />}>
                  New Task
                </Button>
              </Link>
              <LogoutButton />
            </Space>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-6">
          <Table
            dataSource={tasks}
            columns={columns}
            rowKey="id"
            loading={loading}
            scroll={{ x: "max-content" }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} tasks`,
              onChange: (p) => {
                setPage(p);
                fetchTasks(p);
              },
            }}
            locale={{
              emptyText: (
                <div className="py-8 text-center">
                  <p className="text-gray-500 mb-4">No delivery tasks yet</p>
                  <Link href="/tasks/new">
                    <Button type="primary" icon={<PlusOutlined />}>
                      Create Your First Task
                    </Button>
                  </Link>
                </div>
              ),
            }}
          />
        </div>
      </main>
    </div>
  );
}
