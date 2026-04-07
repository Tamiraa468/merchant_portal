"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Table,
  Tag,
  Button,
  Tabs,
  Typography,
  Space,
  Drawer,
  Descriptions,
  Popconfirm,
  App,
  Badge,
  Empty,
  Spin,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Order, OrderItem, OrderStatus } from "@/types/database";
import { ORDER_STATUS_CONFIG } from "@/types/database";

const { Title, Text } = Typography;

interface OrderWithItems extends Order {
  order_items?: OrderItem[];
}

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [liveFlash, setLiveFlash] = useState(false);
  const [activeTab, setActiveTab] = useState<"needs_action" | "active" | "history">("needs_action");
  const [drawerOrder, setDrawerOrder] = useState<OrderWithItems | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const tabFilters: Record<typeof activeTab, OrderStatus[]> = {
    needs_action: ["paid"],
    active: ["preparing", "ready_for_delivery"],
    history: ["cancelled", "pending_payment"],
  };

  const fetchOrders = useCallback(async (tab = activeTab, currentPage = 1) => {
    if (!orgId) return;
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const { data, error, count } = await supabase
        .from("orders")
        .select("*, order_items(*)", { count: "exact" })
        .eq("org_id", orgId)
        .in("status", tabFilters[tab])
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setOrders(data ?? []);
      setTotal(count ?? 0);
    } catch {
      message.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, activeTab, supabase, message]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

  // Real-time subscription
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

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
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
      message.success(`Order ${ORDER_STATUS_CONFIG[newStatus].label}`);
      // Update drawer if open
      if (drawerOrder?.id === orderId) {
        setDrawerOrder((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update order";
      message.error(msg);
    } finally {
      setUpdating(null);
    }
  };

  const columns: ColumnsType<OrderWithItems> = [
    {
      title: "Customer",
      key: "customer",
      render: (_, r) => (
        <div>
          <div className="font-medium">{r.customer_name}</div>
          <div className="text-xs text-gray-500">{r.customer_phone}</div>
        </div>
      ),
    },
    {
      title: "Items",
      key: "items",
      responsive: ["md"],
      render: (_, r) => (
        <div className="text-sm text-gray-600">
          {r.order_items?.map((i) => `${i.product_name} ×${i.qty}`).join(", ") || "—"}
        </div>
      ),
    },
    {
      title: "Total",
      dataIndex: "total_amount",
      key: "total",
      render: (v: number) => (
        <span className="font-semibold text-blue-600">₮{v.toLocaleString()}</span>
      ),
      align: "right",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: OrderStatus) => (
        <Tag color={ORDER_STATUS_CONFIG[s]?.color ?? "default"}>
          {ORDER_STATUS_CONFIG[s]?.label ?? s}
        </Tag>
      ),
    },
    {
      title: "Received",
      dataIndex: "created_at",
      key: "created_at",
      responsive: ["lg"],
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: "Action",
      key: "action",
      render: (_, r) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDrawerOrder(r)}
            aria-label={`View order from ${r.customer_name}`}
          >
            <span className="hidden sm:inline">View</span>
          </Button>
          {r.status === "paid" && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={updating === r.id}
              onClick={() => handleStatusChange(r.id, "preparing")}
              aria-label="Accept order"
            >
              <span className="hidden sm:inline">Accept</span>
            </Button>
          )}
          {(r.status === "paid" || r.status === "preparing") && (
            <Popconfirm
              title="Reject this order?"
              onConfirm={() => handleStatusChange(r.id, "cancelled")}
              okText="Reject"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                loading={updating === r.id}
                aria-label="Reject order"
              />
            </Popconfirm>
          )}
          {r.status === "preparing" && (
            <Button
              size="small"
              onClick={() => handleStatusChange(r.id, "ready_for_delivery")}
              loading={updating === r.id}
            >
              Ready
            </Button>
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
          Needs Action
          {activeTab === "needs_action" && total > 0 && (
            <Badge count={total} size="small" />
          )}
        </Space>
      ),
    },
    { key: "active", label: "Active" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-700" aria-label="Back">
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="mb-0!">Orders</Title>
              <Badge status={isLive ? "success" : "default"} />
              {isLive && (
                <span className="text-xs text-green-600 hidden sm:inline">
                  <WifiOutlined /> Live
                </span>
              )}
              {liveFlash && (
                <span className="text-xs text-blue-600 animate-pulse">New update!</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as typeof activeTab)}
            className="px-4 pt-2"
            items={tabItems}
          />

          <div className="p-4">
            <Table
              dataSource={orders}
              columns={columns}
              rowKey="id"
              loading={loading}
              scroll={{ x: "max-content" }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
                onChange: (p) => { setPage(p); fetchOrders(activeTab, p); },
              }}
              locale={{
                emptyText: (
                  <Empty description={`No ${activeTab.replace("_", " ")} orders`} />
                ),
              }}
            />
          </div>
        </div>
      </main>

      {/* Order Detail Drawer */}
      <Drawer
        title={`Order — ${drawerOrder?.customer_name ?? ""}`}
        open={!!drawerOrder}
        onClose={() => setDrawerOrder(null)}
        width={Math.min(480, typeof window !== "undefined" ? window.innerWidth : 480)}
      >
        {drawerOrder && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Status">
                <Tag color={ORDER_STATUS_CONFIG[drawerOrder.status]?.color ?? "default"}>
                  {ORDER_STATUS_CONFIG[drawerOrder.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">{drawerOrder.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Phone">
                <a href={`tel:${drawerOrder.customer_phone}`}>{drawerOrder.customer_phone}</a>
              </Descriptions.Item>
              <Descriptions.Item label="Subtotal">₮{drawerOrder.subtotal.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Delivery Fee">₮{drawerOrder.delivery_fee.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Total">
                <Text strong className="text-blue-600">₮{drawerOrder.total_amount.toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ordered">
                {new Date(drawerOrder.created_at).toLocaleString()}
              </Descriptions.Item>
              {drawerOrder.note && (
                <Descriptions.Item label="Note">{drawerOrder.note}</Descriptions.Item>
              )}
            </Descriptions>

            {drawerOrder.order_items && drawerOrder.order_items.length > 0 && (
              <div>
                <Text strong className="block mb-2">Items</Text>
                {drawerOrder.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 text-sm">
                    <span>{item.product_name} <span className="text-gray-500">×{item.qty}</span></span>
                    <span className="font-medium">₮{item.line_total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {drawerOrder.status === "paid" && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={updating === drawerOrder.id}
                  onClick={() => handleStatusChange(drawerOrder.id, "preparing")}
                  className="flex-1"
                >
                  Accept Order
                </Button>
              )}
              {drawerOrder.status === "preparing" && (
                <Button
                  type="primary"
                  loading={updating === drawerOrder.id}
                  onClick={() => handleStatusChange(drawerOrder.id, "ready_for_delivery")}
                  className="flex-1"
                >
                  Mark Ready
                </Button>
              )}
              {(drawerOrder.status === "paid" || drawerOrder.status === "preparing") && (
                <Popconfirm
                  title="Reject this order?"
                  onConfirm={() => handleStatusChange(drawerOrder.id, "cancelled")}
                  okText="Reject"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger loading={updating === drawerOrder.id} className="flex-1">
                    Reject
                  </Button>
                </Popconfirm>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
