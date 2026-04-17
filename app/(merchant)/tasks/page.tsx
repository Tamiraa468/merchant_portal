"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Tag, Space, App, Button as AntButton } from "antd";
import { PlusOutlined, SendOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DeliveryTask, TaskStatus } from "@/types/database";
import { DataTable, PageHeader, Button } from "@/components/ui";

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

const statusFilters: { text: string; value: TaskStatus }[] = [
  { text: "Ноорог", value: "draft" },
  { text: "Нийтлэгдсэн", value: "published" },
  { text: "Оноогдсон", value: "assigned" },
  { text: "Авсан", value: "picked_up" },
  { text: "Хүргэсэн", value: "delivered" },
  { text: "Дууссан", value: "completed" },
  { text: "Цуцлагдсан", value: "cancelled" },
  { text: "Амжилтгүй", value: "failed" },
];

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

  const fetchTasks = useCallback(
    async (currentPage = 1) => {
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
          message.error("Даалгавар ачаалахад алдаа гарлаа");
        } else {
          setTasks(data || []);
          setTotal(count ?? 0);
        }
      } catch {
        message.error("Даалгавар ачаалахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    [supabase, orgId, message],
  );

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

      if (profile?.org_id) setOrgId(profile.org_id);
    };

    getOrgId();
  }, [supabase]);

  useEffect(() => {
    if (!orgId) return;

    fetchTasks(page);

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
      setPublishing(null);
    }
  };

  const columns: ColumnsType<DeliveryTaskWithLocations> = [
    {
      title: (
        <Space>
          <span>Хүлээн авагч</span>
          {isLive && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"
              aria-label="Шууд холболт идэвхтэй"
              title="Шууд холболт идэвхтэй"
            />
          )}
        </Space>
      ),
      key: "receiver",
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.receiver_name || "—"}</div>
          <div className="text-gray-500 text-xs">{record.receiver_phone}</div>
        </div>
      ),
    },
    {
      title: "Авах цэг",
      key: "pickup",
      responsive: ["md"],
      render: (_, record) => (
        <div className="max-w-48 truncate text-sm">
          {record.pickup_location?.address_text || "—"}
        </div>
      ),
    },
    {
      title: "Хүргэх цэг",
      key: "dropoff",
      responsive: ["md"],
      render: (_, record) => (
        <div className="max-w-48 truncate text-sm">
          {record.dropoff_location?.address_text || "—"}
        </div>
      ),
    },
    {
      title: "Төлбөр",
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
      title: "Төлөв",
      dataIndex: "status",
      key: "status",
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status] ?? "default"}>
          {statusLabels[status] ?? status}
        </Tag>
      ),
      filters: statusFilters,
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Үүсгэсэн",
      dataIndex: "created_at",
      key: "created_at",
      responsive: ["lg"],
      render: (date: string) => new Date(date).toLocaleDateString("mn-MN"),
    },
    {
      title: "Үйлдэл",
      key: "action",
      render: (_, record) => (
        <Space size="small">
          {(record.status === "draft" || record.status === "created") && (
            <AntButton
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={publishing === record.id}
              onClick={() => handlePublish(record.id)}
              aria-label={`${record.receiver_name}-ийн даалгаврыг нийтлэх`}
            >
              <span className="hidden sm:inline">Нийтлэх</span>
            </AntButton>
          )}
          <Link href={`/tasks/${record.id}`}>
            <AntButton type="link" size="small">
              Харах
            </AntButton>
          </Link>
        </Space>
      ),
    },
  ];

  const headerAction = (
    <Link href="/tasks/new">
      <Button variant="primary" leftIcon={<PlusOutlined />}>
        Шинэ даалгавар
      </Button>
    </Link>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Хүргэлтийн даалгавар" action={headerAction} />

      <DataTable<DeliveryTaskWithLocations>
        columns={columns}
        data={tasks}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: (p) => {
            setPage(p);
            fetchTasks(p);
          },
        }}
        emptyTitle="Одоогоор хүргэлтийн даалгавар алга байна"
        emptyAction={
          <Link href="/tasks/new">
            <Button variant="primary" leftIcon={<PlusOutlined />}>
              Эхний даалгавраа үүсгэх
            </Button>
          </Link>
        }
      />
    </div>
  );
}
