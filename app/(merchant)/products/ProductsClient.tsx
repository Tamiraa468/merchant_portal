"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/auth/LogoutButton";
import Link from "next/link";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Tag,
  Empty,
  App,
  Dropdown,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  CheckCircleOutlined,
  DownOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Product } from "@/types/database";

interface ProductFormValues {
  name: string;
  price: number;
  unit: string;
}

interface ProductsClientProps {
  orgId: string;
}

/** Returns human-readable unavailability label if the product is currently unavailable */
function getUnavailableLabel(until: string | null | undefined): string | null {
  if (!until) return null;
  const d = new Date(until);
  if (d <= new Date()) return null; // already expired
  return `Unavailable until ${d.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}`;
}

const AVAILABILITY_PRESETS = [
  { label: "4 hours",    ms: 4 * 60 * 60 * 1000 },
  { label: "Rest of today", ms: -1 }, // special: end of today
  { label: "1 week",    ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Indefinitely", ms: 0 }, // 0 = no auto-restore; set far future
];

const PAGE_SIZE = 10;

export default function ProductsClient({ orgId }: ProductsClientProps) {
  const { message } = App.useApp();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm<ProductFormValues>();

  const fetchProducts = useCallback(async (currentPage = 1) => {
    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const { data, error, count } = await supabase
        .from("products")
        .select("*", { count: "exact" })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setProducts(data ?? []);
      setTotal(count ?? 0);
    } catch {
      message.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [supabase, orgId, message]);

  useEffect(() => { fetchProducts(1); }, [fetchProducts]);

  const handleSubmit = async (values: ProductFormValues) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .insert({ org_id: orgId, name: values.name.trim(), price: values.price, unit: values.unit.trim(), is_active: true })
        .select()
        .single();

      if (error) throw error;
      message.success("Product added");
      setProducts((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setIsModalOpen(false);
      form.resetFields();
    } catch {
      message.error("Failed to add product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    const newStatus = !product.is_active;
    setTogglingIds((prev) => new Set(prev).add(product.id));
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: newStatus } : p));

    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: newStatus })
        .eq("id", product.id);
      if (error) throw error;
      message.success(newStatus ? "Product activated" : "Product deactivated");
    } catch {
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_active: !newStatus } : p));
      message.error("Failed to update product status");
    } finally {
      setTogglingIds((prev) => { const s = new Set(prev); s.delete(product.id); return s; });
    }
  };

  /** 86 item: sets unavailable_until + deactivates is_active */
  const handle86 = async (product: Product, presetMs: number) => {
    let until: string;
    if (presetMs === 0) {
      // Indefinite: set to year 9999
      until = "9999-01-01T00:00:00Z";
    } else if (presetMs === -1) {
      // End of today
      const eod = new Date();
      eod.setHours(23, 59, 59, 999);
      until = eod.toISOString();
    } else {
      until = new Date(Date.now() + presetMs).toISOString();
    }

    setTogglingIds((prev) => new Set(prev).add(product.id));
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false, unavailable_until: until })
        .eq("id", product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, is_active: false, unavailable_until: until } : p)
      );
      const label = AVAILABILITY_PRESETS.find((p) => p.ms === presetMs)?.label ?? "";
      message.success(`"${product.name}" marked unavailable for ${label}`);
    } catch {
      message.error("Failed to mark item unavailable");
    } finally {
      setTogglingIds((prev) => { const s = new Set(prev); s.delete(product.id); return s; });
    }
  };

  /** Restore availability: clear unavailable_until and reactivate */
  const handleRestore = async (product: Product) => {
    setTogglingIds((prev) => new Set(prev).add(product.id));
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: true, unavailable_until: null })
        .eq("id", product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, is_active: true, unavailable_until: null } : p)
      );
      message.success(`"${product.name}" is available again`);
    } catch {
      message.error("Failed to restore availability");
    } finally {
      setTogglingIds((prev) => { const s = new Set(prev); s.delete(product.id); return s; });
    }
  };

  const columns: ColumnsType<Product> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record) => {
        const unavailLabel = getUnavailableLabel(record.unavailable_until);
        return (
          <div>
            <span className={!record.is_active ? "text-gray-400 line-through" : ""}>{name}</span>
            {unavailLabel && (
              <div className="text-xs text-orange-500 mt-0.5">{unavailLabel}</div>
            )}
          </div>
        );
      },
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      render: (price: number) => `₮${price.toLocaleString()}`,
      sorter: (a, b) => a.price - b.price,
      align: "right",
    },
    {
      title: "Unit",
      dataIndex: "unit",
      key: "unit",
      responsive: ["md"],
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) => {
        const unavailLabel = getUnavailableLabel(record.unavailable_until);
        if (unavailLabel) return <Tag color="orange">Unavailable</Tag>;
        return (
          <Tag color={record.is_active ? "green" : "default"}>
            {record.is_active ? "Active" : "Inactive"}
          </Tag>
        );
      },
      filters: [
        { text: "Active", value: "active" },
        { text: "Inactive", value: "inactive" },
        { text: "Unavailable", value: "unavailable" },
      ],
      onFilter: (value, record) => {
        if (value === "unavailable") return !!getUnavailableLabel(record.unavailable_until);
        if (value === "active") return record.is_active && !getUnavailableLabel(record.unavailable_until);
        return !record.is_active;
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => {
        const isUnavailable = !!getUnavailableLabel(record.unavailable_until);
        const isLoading = togglingIds.has(record.id);

        return (
          <Space size="small" wrap>
            {/* Active toggle */}
            <Tooltip title={record.is_active ? "Deactivate" : "Activate"}>
              <Switch
                checked={record.is_active}
                onChange={() => handleToggleActive(record)}
                loading={isLoading}
                size="small"
                aria-label={`Toggle ${record.name} active status`}
              />
            </Tooltip>

            {/* 86 / Restore */}
            {isUnavailable ? (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<CheckCircleOutlined />}
                loading={isLoading}
                onClick={() => handleRestore(record)}
                aria-label={`Restore ${record.name}`}
              >
                Restore
              </Button>
            ) : (
              <Dropdown
                menu={{
                  items: AVAILABILITY_PRESETS.map((preset, idx) => ({
                    key: idx,
                    label: preset.label,
                    onClick: () => handle86(record, preset.ms),
                  })),
                }}
                trigger={["click"]}
              >
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  loading={isLoading}
                  aria-label={`Mark ${record.name} unavailable`}
                >
                  86 Item <DownOutlined />
                </Button>
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Products</h1>
              <nav className="hidden md:flex items-center gap-4" aria-label="Section navigation">
                {[
                  { href: "/dashboard", label: "Dashboard" },
                  { href: "/orders", label: "Orders" },
                  { href: "/tasks", label: "Tasks" },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-sm font-medium"
                  >
                    {l.label}
                  </Link>
                ))}
                <Link href="/products" className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                  Products
                </Link>
              </nav>
            </div>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => fetchProducts(page)} loading={loading} aria-label="Refresh products">
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setIsModalOpen(true); }}>
                Add Product
              </Button>
              <LogoutButton />
            </Space>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            <strong>86 Item</strong> temporarily removes a product from ordering. Choose a duration from the dropdown.
            It auto-restores when the time expires, or you can restore it early.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <Table
            columns={columns}
            dataSource={products}
            rowKey="id"
            loading={loading}
            scroll={{ x: "max-content" }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} products`,
              onChange: (p) => { setPage(p); fetchProducts(p); },
            }}
            locale={{
              emptyText: (
                <Empty description="No products yet. Click 'Add Product' to create one." />
              ),
            }}
          />
        </div>
      </main>

      {/* Add Product Modal */}
      <Modal
        title="Add New Product"
        open={isModalOpen}
        onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
        footer={null}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <Form.Item
            name="name"
            label="Product Name"
            rules={[
              { required: true, message: "Please enter the product name" },
              { min: 2, message: "Name must be at least 2 characters" },
            ]}
          >
            <Input placeholder="Enter product name" maxLength={100} />
          </Form.Item>

          <Form.Item
            name="price"
            label="Price (₮)"
            rules={[
              { required: true, message: "Please enter the price" },
              { type: "number", min: 0, message: "Price must be a positive number" },
            ]}
          >
            <InputNumber
              placeholder="0"
              min={0}
              step={100}
              formatter={(v) => `₮ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              parser={(v: any) => Number(String(v).replace(/₮\s?|(,*)/g, ""))}
              className="w-full"
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            name="unit"
            label="Unit"
            rules={[{ required: true, message: "Please enter the unit" }]}
          >
            <Input placeholder="e.g., pcs, kg, box" maxLength={20} />
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button onClick={() => { setIsModalOpen(false); form.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>Add Product</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
