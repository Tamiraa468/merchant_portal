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
  Button as AntButton,
  Space,
  Typography,
  Spin,
  Result,
  App,
  Popconfirm,
} from "antd";
import {
  EnvironmentOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  DeleteOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DeliveryTask, TaskStatus, Product } from "@/types/database";
import EpodVerification from "@/components/epod/EpodVerification";
import { PageHeader } from "@/components/ui";

const { Text } = Typography;

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
  product_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
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
  draft: "Ноорог",
  created: "Ноорог",
  published: "Нийтлэгдсэн",
  assigned: "Оноогдсон",
  picked_up: "Авсан",
  delivered: "Хүргэсэн",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
  failed: "Амжилтгүй",
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
          setError("Даалгавар олдсонгүй");
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
      setError("Даалгавар ачаалахад алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    if (taskId) fetchTask();
  }, [taskId, fetchTask]);

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
      message.success("Даалгавар устгагдлаа");
      router.push("/tasks");
    } catch {
      message.error("Даалгавар устгахад алдаа гарлаа");
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
      message.success("Даалгавар нийтлэгдлээ. Жолооч нар харах боломжтой.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      message.error(`Нийтлэхэд алдаа гарлаа: ${msg}`);
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
      message.success(`Төлөв өөрчлөгдлөө: ${statusLabels[newStatus]}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      message.error(`Алдаа гарлаа: ${msg}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalAmount = taskItems.reduce((sum, item) => {
    return sum + item.total_price;
  }, 0);

  const itemColumns: ColumnsType<TaskItemWithProduct> = [
    {
      title: "Бүтээгдэхүүн",
      key: "product",
      render: (_, record) =>
        record.product_name || record.product?.name || "Тодорхойгүй бүтээгдэхүүн",
    },
    {
      title: "Нэгж үнэ",
      key: "price",
      render: (_, record) => `₮${record.unit_price.toLocaleString()}`,
      align: "right",
    },
    {
      title: "Тоо",
      dataIndex: "quantity",
      key: "quantity",
      align: "center",
    },
    {
      title: "Нийт",
      key: "total",
      render: (_, record) => (
        <Text strong>₮{record.total_price.toLocaleString()}</Text>
      ),
      align: "right",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="Даалгавар олдсонгүй" backHref="/tasks" />
        <Result
          status="404"
          title="Даалгавар олдсонгүй"
          subTitle={error || "Хайсан даалгавар тань байхгүй байна."}
          extra={
            <Link href="/tasks">
              <AntButton type="primary">Даалгавар руу буцах</AntButton>
            </Link>
          }
        />
      </div>
    );
  }

  const canCancel = ["draft", "created", "published", "assigned"].includes(task.status);
  const canDelete = task.status === "draft" || task.status === "created";
  const canPublish = task.status === "draft" || task.status === "created";

  const headerAction = (
    <Space wrap>
      {canPublish && (
        <AntButton
          type="primary"
          icon={<SendOutlined />}
          loading={publishing}
          onClick={handlePublish}
        >
          Нийтлэх
        </AntButton>
      )}
      {canCancel && (
        <Popconfirm
          title="Энэ даалгаврыг цуцлах уу?"
          onConfirm={() => handleStatusChange("cancelled")}
          okText="Тийм, цуцлах"
          cancelText="Үгүй"
          okButtonProps={{ danger: true }}
        >
          <AntButton icon={<StopOutlined />} loading={updatingStatus}>
            Даалгавар цуцлах
          </AntButton>
        </Popconfirm>
      )}
      {canDelete && (
        <Popconfirm
          title="Энэ даалгаврыг устгах уу?"
          description="Энэ үйлдлийг буцаах боломжгүй."
          onConfirm={handleDelete}
          okText="Тийм, устгах"
          cancelText="Цуцлах"
          okButtonProps={{ danger: true }}
        >
          <AntButton danger icon={<DeleteOutlined />} loading={deleting}>
            Устгах
          </AntButton>
        </Popconfirm>
      )}
    </Space>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Даалгаврын дэлгэрэнгүй"
        backHref="/tasks"
        action={headerAction}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <Text type="secondary" className="text-xs uppercase">
              Төлөв
            </Text>
            <div className="mt-1 flex items-center gap-2">
              <Tag
                color={statusColors[task.status] ?? "default"}
                className="text-base px-3 py-1"
              >
                {statusLabels[task.status] ?? task.status}
              </Tag>
              {isLive && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"
                  aria-label="Шууд холболт идэвхтэй"
                  title="Шууд холболт идэвхтэй"
                />
              )}
            </div>
          </div>
          <div>
            <Text type="secondary" className="text-xs uppercase">
              Хүргэлтийн төлбөр
            </Text>
            <div className="mt-1">
              <Text strong className="text-2xl text-blue-600">
                ₮{(task.delivery_fee ?? 0).toLocaleString()}
              </Text>
            </div>
            <Text type="secondary" className="text-xs">
              Жолоочийн орлого
            </Text>
          </div>
          <div className="text-right">
            <Text type="secondary" className="text-xs uppercase">
              Үүсгэсэн
            </Text>
            <div className="mt-1">
              <Text>{new Date(task.created_at).toLocaleString("mn-MN")}</Text>
            </div>
          </div>
          {task.package_value && (
            <div>
              <Text type="secondary" className="text-xs uppercase">
                Багцын үнэ
              </Text>
              <div className="mt-1">
                <Text strong className="text-lg">
                  ₮{task.package_value.toLocaleString()}
                </Text>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={
          <Space>
            <EnvironmentOutlined aria-hidden="true" />
            <span>Цэгүүд</span>
          </Space>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Text type="secondary" className="text-xs uppercase">
              Авах
            </Text>
            <div className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Text strong>{task.pickup_location?.address_text || "—"}</Text>
              {task.pickup_note && (
                <div className="mt-1 text-sm text-gray-500">
                  {task.pickup_note}
                </div>
              )}
            </div>
          </div>
          <div>
            <Text type="secondary" className="text-xs uppercase">
              Хүргэх
            </Text>
            <div className="mt-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Text strong>{task.dropoff_location?.address_text || "—"}</Text>
              {task.dropoff_note && (
                <div className="mt-1 text-sm text-gray-500">
                  {task.dropoff_note}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={
          <Space>
            <UserOutlined aria-hidden="true" />
            <span>Хүлээн авагч</span>
          </Space>
        }
      >
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Нэр">
            {task.receiver_name || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Утас">
            {task.receiver_phone ? (
              <a href={`tel:${task.receiver_phone}`}>{task.receiver_phone}</a>
            ) : (
              "—"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Үйлчлүүлэгчийн имэйл">
            {task.customer_email ? (
              <a
                href={`mailto:${task.customer_email}`}
                className="text-blue-600"
              >
                {task.customer_email}
              </a>
            ) : (
              <Text type="secondary">Оруулаагүй</Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {task.status === "delivered" && (
        <Card
          title={
            <Space>
              <span>📦 Хүргэлтийн баталгаа</span>
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

      <Card
        title={
          <Space>
            <ShoppingCartOutlined aria-hidden="true" />
            <span>Бараа ({taskItems.length})</span>
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
                <Text className="text-lg">Нийт:</Text>
                <Text strong className="text-xl text-blue-600">
                  ₮{totalAmount.toLocaleString()}
                </Text>
              </Space>
            </div>
          </>
        ) : (
          <Text type="secondary">Энэ даалгаварт бараа хавсраагүй.</Text>
        )}
      </Card>
    </div>
  );
}
