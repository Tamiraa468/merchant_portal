"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Card,
  Descriptions,
  Tag,
  Table,
  Button,
  Space,
  Typography,
  Spin,
  Result,
  App,
  Popconfirm,
  Badge,
  Alert,
} from "antd";
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  DeleteOutlined,
  SendOutlined,
  StopOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DeliveryTask, TaskStatus, Product } from "@/types/database";
import EpodVerification from "@/components/epod/EpodVerification";

const { Title, Text } = Typography;

interface TaskWithDetails extends Omit<
  DeliveryTask,
  "pickup_location" | "dropoff_location"
> {
  pickup_location: { address_text: string; note?: string } | null;
  dropoff_location: { address_text: string; note?: string } | null;
}

interface TaskItemWithProduct {
  id: string;
  task_id: string;
  product_id: string;
  qty: number;
  note?: string | null;
  product: Product | null;
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

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { message } = App.useApp();
  const taskId = params.id as string;

  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [taskItems, setTaskItems] = useState<TaskItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [liveUpdate, setLiveUpdate] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTask = useCallback(async () => {
    setError(null);
    try {
      const { data: taskData, error: taskError } = await supabase
        .from("delivery_tasks")
        .select(
          `*,
          pickup_location:locations!pickup_location_id(address_text, note),
          dropoff_location:locations!dropoff_location_id(address_text, note)`,
        )
        .eq("id", taskId)
        .single();

      if (taskError) {
        if (taskError.code === "PGRST116") {
          setError("Task not found");
        } else {
          throw taskError;
        }
        return;
      }

      setTask(taskData);

      const { data: itemsData } = await supabase
        .from("task_items")
        .select(`*, product:products(*)`)
        .eq("task_id", taskId);

      setTaskItems(itemsData || []);
    } catch {
      setError("Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [supabase, taskId]);

  // Initial fetch
  useEffect(() => {
    if (taskId) fetchTask();
  }, [taskId, fetchTask]);

  // Real-time subscription for this task
  useEffect(() => {
    if (!taskId) return;

    channelRef.current = supabase
      .channel(`task-detail-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "delivery_tasks",
          filter: `id=eq.${taskId}`,
        },
        () => {
          fetchTask();
          setLiveUpdate(true);
          setTimeout(() => setLiveUpdate(false), 3000);
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [taskId, supabase, fetchTask]);

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("delivery_tasks")
        .delete()
        .eq("id", task.id);

      if (deleteError) throw deleteError;
      message.success("Task deleted");
      router.push("/tasks");
    } catch {
      message.error("Failed to delete task");
      setDeleting(false);
    }
  };

  const handlePublish = async () => {
    if (!task) return;
    setPublishing(true);
    try {
      const { error } = await supabase.rpc("publish_delivery_task", {
        p_task_id: task.id,
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
      setPublishing(false);
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task) return;
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("delivery_tasks")
        .update({ status: newStatus })
        .eq("id", task.id);
      if (error) throw error;
      message.success(`Status updated to ${statusLabels[newStatus]}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message :
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      message.error(`Failed: ${msg}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalAmount = taskItems.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.qty;
  }, 0);

  const itemColumns: ColumnsType<TaskItemWithProduct> = [
    {
      title: "Product",
      key: "product",
      render: (_, record) => record.product?.name || "Unknown Product",
    },
    {
      title: "Unit Price",
      key: "price",
      render: (_, record) =>
        `₮${(record.product?.price || 0).toLocaleString()}`,
      align: "right",
    },
    {
      title: "Qty",
      dataIndex: "qty",
      key: "qty",
      align: "center",
    },
    {
      title: "Total",
      key: "total",
      render: (_, record) => (
        <Text strong>
          ₮{((record.product?.price || 0) * record.qty).toLocaleString()}
        </Text>
      ),
      align: "right",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <Result
          status="404"
          title="Task Not Found"
          subTitle={error || "The task you're looking for doesn't exist."}
          extra={
            <Link href="/tasks">
              <Button type="primary">Back to Tasks</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const canCancel = ["draft", "created", "published", "assigned"].includes(task.status);
  const canDelete = task.status === "draft" || task.status === "created";
  const canPublish = task.status === "draft" || task.status === "created";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Link
                href="/tasks"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Back to tasks"
              >
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="mb-0!">
                Task Details
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
              {canPublish && (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={publishing}
                  onClick={handlePublish}
                  aria-label="Publish task"
                >
                  Publish
                </Button>
              )}
              {canCancel && (
                <Popconfirm
                  title="Cancel this task?"
                  onConfirm={() => handleStatusChange("cancelled")}
                  okText="Yes, Cancel"
                  cancelText="No"
                  okButtonProps={{ danger: true }}
                >
                  <Button icon={<StopOutlined />} loading={updatingStatus}>
                    Cancel Task
                  </Button>
                </Popconfirm>
              )}
              {canDelete && (
                <Popconfirm
                  title="Delete this task?"
                  description="This action cannot be undone."
                  onConfirm={handleDelete}
                  okText="Yes, Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    Delete
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
        </div>
      </header>

      {/* Live update flash */}
      {liveUpdate && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Alert
            message="Task status updated in real-time"
            type="success"
            showIcon
            closable
          />
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status Card */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <Text type="secondary" className="text-xs uppercase">Status</Text>
              <div className="mt-1">
                <Tag
                  color={statusColors[task.status] ?? "default"}
                  className="text-base px-3 py-1"
                >
                  {statusLabels[task.status] ?? task.status}
                </Tag>
              </div>
            </div>
            <div>
              <Text type="secondary" className="text-xs uppercase">Delivery Fee</Text>
              <div className="mt-1">
                <Text strong className="text-2xl text-blue-600">
                  ₮{(task.delivery_fee ?? 0).toLocaleString()}
                </Text>
              </div>
              <Text type="secondary" className="text-xs">Courier earnings</Text>
            </div>
            <div className="text-right">
              <Text type="secondary" className="text-xs uppercase">Created</Text>
              <div className="mt-1">
                <Text>{new Date(task.created_at).toLocaleString()}</Text>
              </div>
            </div>
            {task.package_value && (
              <div>
                <Text type="secondary" className="text-xs uppercase">Package Value</Text>
                <div className="mt-1">
                  <Text strong className="text-lg">
                    ₮{task.package_value.toLocaleString()}
                  </Text>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Locations Card */}
        <Card
          title={
            <Space>
              <EnvironmentOutlined aria-hidden="true" />
              <span>Locations</span>
            </Space>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Text type="secondary" className="text-xs uppercase">Pickup</Text>
              <div className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Text strong>{task.pickup_location?.address_text || "N/A"}</Text>
                {task.pickup_note && (
                  <div className="mt-1 text-sm text-gray-500">{task.pickup_note}</div>
                )}
              </div>
            </div>
            <div>
              <Text type="secondary" className="text-xs uppercase">Dropoff</Text>
              <div className="mt-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <Text strong>{task.dropoff_location?.address_text || "N/A"}</Text>
                {task.dropoff_note && (
                  <div className="mt-1 text-sm text-gray-500">{task.dropoff_note}</div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Receiver Card */}
        <Card
          title={
            <Space>
              <UserOutlined aria-hidden="true" />
              <span>Receiver</span>
            </Space>
          }
        >
          <Descriptions column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Name">
              {task.receiver_name || "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Phone">
              {task.receiver_phone ? (
                <a href={`tel:${task.receiver_phone}`}>{task.receiver_phone}</a>
              ) : "N/A"}
            </Descriptions.Item>
            <Descriptions.Item label="Customer Email">
              {task.customer_email ? (
                <a href={`mailto:${task.customer_email}`} className="text-blue-600">
                  {task.customer_email}
                </a>
              ) : (
                <Text type="secondary">Not set</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* ePOD Verification — shown only when courier has marked delivered */}
        {task.status === "delivered" && (
          <Card
            title={
              <Space>
                <span>📦 Proof of Delivery</span>
              </Space>
            }
            styles={{ header: { borderBottom: "2px solid #3b82f6" } }}
          >
            <EpodVerification
              taskId={task.id}
              customerEmail={task.customer_email}
            />
          </Card>
        )}

        {/* Items Card */}
        <Card
          title={
            <Space>
              <ShoppingCartOutlined aria-hidden="true" />
              <span>Items ({taskItems.length})</span>
            </Space>
          }
        >
          {taskItems.length > 0 ? (
            <>
              <Table
                dataSource={taskItems}
                columns={itemColumns}
                rowKey="id"
                pagination={false}
                size="middle"
                scroll={{ x: "max-content" }}
              />
              <div className="flex justify-end mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Space size="large">
                  <Text className="text-lg">Total:</Text>
                  <Text strong className="text-xl text-blue-600">
                    ₮{totalAmount.toLocaleString()}
                  </Text>
                </Space>
              </div>
            </>
          ) : (
            <Text type="secondary">No items attached to this task.</Text>
          )}
        </Card>
      </main>
    </div>
  );
}
