"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Tag,
  Tabs,
  Space,
  Drawer,
  Descriptions,
  Popconfirm,
  App,
  Badge,
  Typography,
  Button as AntButton,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Order, OrderItem, OrderStatus } from "@/types/database";
import { ORDER_STATUS_CONFIG } from "@/types/database";
import { DataTable, PageHeader } from "@/components/ui";

const { Text } = Typography;

interface OrderWithItems extends Order {
  order_items?: OrderItem[];
}

const PAGE_SIZE = 10;

type TabKey = "needs_action" | "active" | "history";

const TAB_FILTERS: Record<TabKey, OrderStatus[]> = {
  needs_action: ["paid"],
  active: ["preparing", "ready_for_delivery"],
  history: ["cancelled", "pending_payment"],
};

const TAB_EMPTY_LABEL: Record<TabKey, string> = {
  needs_action: "хүлээгдэж буй",
  active: "бэлтгэгдэж буй",
  history: "түүхэнд",
};

export default function OrdersPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [liveFlash, setLiveFlash] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("needs_action");
  const [drawerOrder, setDrawerOrder] = useState<OrderWithItems | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchOrders = useCallback(
    async (tab: TabKey = activeTab, currentPage = 1) => {
      if (!orgId) return;
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        const { data, error, count } = await supabase
          .from("orders")
          .select("*, order_items(*)", { count: "exact" })
          .eq("org_id", orgId)
          .in("status", TAB_FILTERS[tab])
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;
        setOrders(data ?? []);
        setTotal(count ?? 0);
      } catch {
        message.error("Захиалга ачаалахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    [orgId, activeTab, supabase, message],
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
      if (profile?.org_id) setOrgId(profile.org_id);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    if (!orgId) return;
    fetchOrders(activeTab, 1);
    setPage(1);
  }, [orgId, activeTab, fetchOrders]);

  useEffect(() => {
    if (!orgId) return;

    channelRef.current = supabase
      .channel(`orders-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `org_id=eq.${orgId}` },
        () => {
          fetchOrders(activeTab, page);
          setLiveFlash(true);
          setTimeout(() => setLiveFlash(false), 2000);
        },
      )
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setUpdating(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);
      if (error) throw error;
      message.success(`Захиалга: ${ORDER_STATUS_CONFIG[newStatus].label}`);
      if (drawerOrder?.id === orderId) {
        setDrawerOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Захиалгыг шинэчлэхэд алдаа гарлаа";
      message.error(msg);
    } finally {
      setUpdating(null);
    }
  };

  const columns: ColumnsType<OrderWithItems> = [
    {
      title: "Үйлчлүүлэгч",
      key: "customer",
      render: (_, r) => (
        <div>
          <div className="font-medium">{r.customer_name}</div>
          <div className="text-xs text-gray-500">{r.customer_phone}</div>
        </div>
      ),
    },
    {
      title: "Бараа",
      key: "items",
      responsive: ["md"],
      render: (_, r) => (
        <div className="text-sm text-gray-600">
          {r.order_items?.map((i) => `${i.product_name} ×${i.qty}`).join(", ") ||
            "—"}
        </div>
      ),
    },
    {
      title: "Дүн",
      dataIndex: "total_amount",
      key: "total",
      render: (v: number) => (
        <span className="font-semibold text-blue-600">₮{v.toLocaleString()}</span>
      ),
      align: "right",
    },
    {
      title: "Төлөв",
      dataIndex: "status",
      key: "status",
      render: (s: OrderStatus) => (
        <Tag color={ORDER_STATUS_CONFIG[s]?.color ?? "default"}>
          {ORDER_STATUS_CONFIG[s]?.label ?? s}
        </Tag>
      ),
    },
    {
      title: "Хүлээн авсан",
      dataIndex: "created_at",
      key: "created_at",
      responsive: ["lg"],
      render: (d: string) => new Date(d).toLocaleString("mn-MN"),
    },
    {
      title: "Үйлдэл",
      key: "action",
      render: (_, r) => (
        <Space size="small">
          <AntButton
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDrawerOrder(r)}
            aria-label={`${r.customer_name}-ийн захиалга харах`}
          >
            <span className="hidden sm:inline">Харах</span>
          </AntButton>
          {r.status === "paid" && (
            <AntButton
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={updating === r.id}
              onClick={() => handleStatusChange(r.id, "preparing")}
            >
              <span className="hidden sm:inline">Хүлээн авах</span>
            </AntButton>
          )}
          {(r.status === "paid" || r.status === "preparing") && (
            <Popconfirm
              title="Энэ захиалгыг татгалзах уу?"
              onConfirm={() => handleStatusChange(r.id, "cancelled")}
              okText="Татгалзах"
              cancelText="Буцах"
              okButtonProps={{ danger: true }}
            >
              <AntButton
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                loading={updating === r.id}
                aria-label="Захиалгыг татгалзах"
              />
            </Popconfirm>
          )}
          {r.status === "preparing" && (
            <AntButton
              size="small"
              onClick={() => handleStatusChange(r.id, "ready_for_delivery")}
              loading={updating === r.id}
            >
              Бэлэн
            </AntButton>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: "needs_action",
      label: (
        <Space>
          Хүлээгдэж буй
          {activeTab === "needs_action" && total > 0 && (
            <Badge count={total} size="small" />
          )}
        </Space>
      ),
    },
    { key: "active", label: "Бэлтгэгдэж буй" },
    { key: "history", label: "Түүх" },
  ];

  const liveIndicator = (
    <Space>
      <Badge status={isLive ? "success" : "default"} />
      {isLive && (
        <span className="text-xs text-green-600 hidden sm:inline">
          <WifiOutlined /> Шууд
        </span>
      )}
      {liveFlash && (
        <span className="text-xs text-blue-600 animate-pulse">Шинэчлэгдлээ</span>
      )}
    </Space>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Захиалга" action={liveIndicator} />

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
          className="px-4 pt-2"
          items={tabItems}
        />
      </div>

      <DataTable<OrderWithItems>
        columns={columns}
        data={orders}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: (p) => {
            setPage(p);
            fetchOrders(activeTab, p);
          },
        }}
        emptyTitle="Захиалга алга байна"
        emptyDescription={`Одоогоор ${TAB_EMPTY_LABEL[activeTab]} захиалга алга.`}
      />

      <Drawer
        title={`Захиалга — ${drawerOrder?.customer_name ?? ""}`}
        open={!!drawerOrder}
        onClose={() => setDrawerOrder(null)}
        width={Math.min(480, typeof window !== "undefined" ? window.innerWidth : 480)}
      >
        {drawerOrder && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Төлөв">
                <Tag color={ORDER_STATUS_CONFIG[drawerOrder.status]?.color ?? "default"}>
                  {ORDER_STATUS_CONFIG[drawerOrder.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Үйлчлүүлэгч">
                {drawerOrder.customer_name}
              </Descriptions.Item>
              <Descriptions.Item label="Утас">
                <a href={`tel:${drawerOrder.customer_phone}`}>
                  {drawerOrder.customer_phone}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="Дэд дүн">
                ₮{drawerOrder.subtotal.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Хүргэлтийн төлбөр">
                ₮{drawerOrder.delivery_fee.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Нийт">
                <Text strong className="text-blue-600">
                  ₮{drawerOrder.total_amount.toLocaleString()}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Захиалгын огноо">
                {new Date(drawerOrder.created_at).toLocaleString("mn-MN")}
              </Descriptions.Item>
              {drawerOrder.note && (
                <Descriptions.Item label="Тэмдэглэл">
                  {drawerOrder.note}
                </Descriptions.Item>
              )}
            </Descriptions>

            {drawerOrder.order_items && drawerOrder.order_items.length > 0 && (
              <div>
                <Text strong className="block mb-2">
                  Бараа
                </Text>
                {drawerOrder.order_items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 text-sm"
                  >
                    <span>
                      {item.product_name}{" "}
                      <span className="text-gray-500">×{item.qty}</span>
                    </span>
                    <span className="font-medium">
                      ₮{item.line_total.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {drawerOrder.status === "paid" && (
                <AntButton
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={updating === drawerOrder.id}
                  onClick={() => handleStatusChange(drawerOrder.id, "preparing")}
                  className="flex-1"
                >
                  Хүлээн авах
                </AntButton>
              )}
              {drawerOrder.status === "preparing" && (
                <AntButton
                  type="primary"
                  loading={updating === drawerOrder.id}
                  onClick={() =>
                    handleStatusChange(drawerOrder.id, "ready_for_delivery")
                  }
                  className="flex-1"
                >
                  Бэлэн болсон
                </AntButton>
              )}
              {(drawerOrder.status === "paid" ||
                drawerOrder.status === "preparing") && (
                <Popconfirm
                  title="Энэ захиалгыг татгалзах уу?"
                  onConfirm={() => handleStatusChange(drawerOrder.id, "cancelled")}
                  okText="Татгалзах"
                  cancelText="Буцах"
                  okButtonProps={{ danger: true }}
                >
                  <AntButton
                    danger
                    loading={updating === drawerOrder.id}
                    className="flex-1"
                  >
                    Татгалзах
                  </AntButton>
                </Popconfirm>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
