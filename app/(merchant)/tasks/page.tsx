"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/LogoutButton";
import Link from "next/link";
import { Table, Tag, Button, Space, Typography, App } from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  SendOutlined,
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
  canceled: "red",
  failed: "magenta",
};

const statusLabels: Record<TaskStatus, string> = {
  draft: "Draft",
  created: "Draft",
  published: "Published",
  assigned: "Assigned",
  picked_up: "Picked Up",
  delivered: "Delivered",
  canceled: "Canceled",
  failed: "Failed",
};

export default function TasksPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [tasks, setTasks] = useState<DeliveryTaskWithLocations[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("delivery_tasks")
        .select(
          `
          *,
          pickup_location:locations!pickup_location_id(address_text),
          dropoff_location:locations!dropoff_location_id(address_text)
        `,
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching tasks:", error);
        message.error("Failed to load delivery tasks");
      } else {
        setTasks(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      message.error("Failed to load delivery tasks");
    } finally {
      setLoading(false);
    }
  }, [supabase, orgId, message]);

  // Get org_id on mount
  useEffect(() => {
    const getOrgId = async () => {
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
      }
    };

    getOrgId();
  }, [supabase]);

  // Fetch tasks when orgId is available
  useEffect(() => {
    if (orgId) {
      fetchTasks();
    }
  }, [orgId, fetchTasks]);

  const [publishing, setPublishing] = useState<string | null>(null);

  const handlePublish = async (taskId: string) => {
    setPublishing(taskId);
    try {
      const { error } = await supabase.rpc("publish_delivery_task", {
        p_task_id: taskId,
      });
      if (error) throw error;
      message.success("Task published! Couriers can now see it.");
      fetchTasks();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      console.error("Publish error:", JSON.stringify(err));
      message.error(`Failed to publish: ${errorMessage}`);
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
          <div className="font-medium">{record.receiver_name}</div>
          <div className="text-gray-500 text-sm">{record.receiver_phone}</div>
        </div>
      ),
    },
    {
      title: "Pickup",
      key: "pickup",
      render: (_, record) => (
        <div className="max-w-[200px]">
          <div className="truncate">
            {record.pickup_location?.address_text || "N/A"}
          </div>
        </div>
      ),
    },
    {
      title: "Dropoff",
      key: "dropoff",
      render: (_, record) => (
        <div className="max-w-[200px]">
          <div className="truncate">
            {record.dropoff_location?.address_text || "N/A"}
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Space>
          {(record.status === "draft" || record.status === "created") && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={publishing === record.id}
              onClick={() => handlePublish(record.id)}
            >
              Publish
            </Button>
          )}
          <Link href={`/tasks/${record.id}`}>
            <Button type="link" size="small">
              View
            </Button>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="!mb-0">
                Delivery Tasks
              </Title>
            </div>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchTasks}>
                Refresh
              </Button>
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <Table
            dataSource={tasks}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
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
