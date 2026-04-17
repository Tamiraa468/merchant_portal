"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Tag,
  App,
  Dropdown,
  Tooltip,
  Button as AntButton,
} from "antd";
import {
  ReloadOutlined,
  StopOutlined,
  CheckCircleOutlined,
  DownOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Product } from "@/types/database";
import { Button, DataTable, PageHeader } from "@/components/ui";

interface ProductFormValues {
  name: string;
  price: number;
  unit: string;
}

interface ProductsClientProps {
  orgId: string;
}

function getUnavailableLabel(until: string | null | undefined): string | null {
  if (!until) return null;
  const d = new Date(until);
  if (d <= new Date()) return null;
  return `${d.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })} хүртэл боломжгүй`;
}

const AVAILABILITY_PRESETS = [
  { label: "4 цаг", ms: 4 * 60 * 60 * 1000 },
  { label: "Өнөөдрийн үлдсэн цагт", ms: -1 },
  { label: "1 долоо хоног", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Тодорхойгүй хугацаагаар", ms: 0 },
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

  const fetchProducts = useCallback(
    async (currentPage = 1) => {
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
        message.error("Бүтээгдэхүүн ачаалахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    [supabase, orgId, message],
  );

  useEffect(() => {
    fetchProducts(1);
  }, [fetchProducts]);

  const handleSubmit = async (values: ProductFormValues) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .insert({
          org_id: orgId,
          name: values.name.trim(),
          price: values.price,
          unit: values.unit.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      message.success("Бүтээгдэхүүн нэмэгдлээ");
      setProducts((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setIsModalOpen(false);
      form.resetFields();
    } catch {
      message.error("Бүтээгдэхүүн нэмэхэд алдаа гарлаа");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    const newStatus = !product.is_active;
    setTogglingIds((prev) => new Set(prev).add(product.id));
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_active: newStatus } : p)),
    );

    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: newStatus })
        .eq("id", product.id);
      if (error) throw error;
      message.success(newStatus ? "Идэвхжүүлэв" : "Идэвхгүй болгов");
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: !newStatus } : p)),
      );
      message.error("Төлөв шинэчлэхэд алдаа гарлаа");
    } finally {
      setTogglingIds((prev) => {
        const s = new Set(prev);
        s.delete(product.id);
        return s;
      });
    }
  };

  const handle86 = async (product: Product, presetMs: number) => {
    let until: string;
    if (presetMs === 0) {
      until = "9999-01-01T00:00:00Z";
    } else if (presetMs === -1) {
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
        prev.map((p) =>
          p.id === product.id
            ? { ...p, is_active: false, unavailable_until: until }
            : p,
        ),
      );
      const label = AVAILABILITY_PRESETS.find((p) => p.ms === presetMs)?.label ?? "";
      message.success(`"${product.name}" — ${label} боломжгүй`);
    } catch {
      message.error("Боломжгүй болгоход алдаа гарлаа");
    } finally {
      setTogglingIds((prev) => {
        const s = new Set(prev);
        s.delete(product.id);
        return s;
      });
    }
  };

  const handleRestore = async (product: Product) => {
    setTogglingIds((prev) => new Set(prev).add(product.id));
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: true, unavailable_until: null })
        .eq("id", product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, is_active: true, unavailable_until: null }
            : p,
        ),
      );
      message.success(`"${product.name}" дахин боломжтой`);
    } catch {
      message.error("Сэргээхэд алдаа гарлаа");
    } finally {
      setTogglingIds((prev) => {
        const s = new Set(prev);
        s.delete(product.id);
        return s;
      });
    }
  };

  const columns: ColumnsType<Product> = [
    {
      title: "Нэр",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record) => {
        const unavailLabel = getUnavailableLabel(record.unavailable_until);
        return (
          <div>
            <span className={!record.is_active ? "text-gray-400 line-through" : ""}>
              {name}
            </span>
            {unavailLabel && (
              <div className="text-xs text-orange-500 mt-0.5">{unavailLabel}</div>
            )}
          </div>
        );
      },
    },
    {
      title: "Үнэ",
      dataIndex: "price",
      key: "price",
      render: (price: number) => `₮${price.toLocaleString()}`,
      sorter: (a, b) => a.price - b.price,
      align: "right",
    },
    {
      title: "Нэгж",
      dataIndex: "unit",
      key: "unit",
      responsive: ["md"],
    },
    {
      title: "Төлөв",
      key: "status",
      render: (_, record) => {
        const unavailLabel = getUnavailableLabel(record.unavailable_until);
        if (unavailLabel) return <Tag color="orange">Боломжгүй</Tag>;
        return (
          <Tag color={record.is_active ? "green" : "default"}>
            {record.is_active ? "Идэвхтэй" : "Идэвхгүй"}
          </Tag>
        );
      },
      filters: [
        { text: "Идэвхтэй", value: "active" },
        { text: "Идэвхгүй", value: "inactive" },
        { text: "Боломжгүй", value: "unavailable" },
      ],
      onFilter: (value, record) => {
        if (value === "unavailable")
          return !!getUnavailableLabel(record.unavailable_until);
        if (value === "active")
          return (
            record.is_active && !getUnavailableLabel(record.unavailable_until)
          );
        return !record.is_active;
      },
    },
    {
      title: "Үйлдэл",
      key: "actions",
      render: (_, record) => {
        const isUnavailable = !!getUnavailableLabel(record.unavailable_until);
        const isLoading = togglingIds.has(record.id);

        return (
          <Space size="small" wrap>
            <Tooltip title={record.is_active ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}>
              <Switch
                checked={record.is_active}
                onChange={() => handleToggleActive(record)}
                loading={isLoading}
                size="small"
                aria-label={`${record.name}-ийн идэвхтэй төлөв`}
              />
            </Tooltip>

            {isUnavailable ? (
              <AntButton
                size="small"
                type="primary"
                ghost
                icon={<CheckCircleOutlined />}
                loading={isLoading}
                onClick={() => handleRestore(record)}
              >
                Сэргээх
              </AntButton>
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
                <Tooltip title="Бүтээгдэхүүнийг түр хугацаанд захиалгаас хасах. Сонгосон хугацаа дуусахад автоматаар сэргэнэ.">
                  <AntButton
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    loading={isLoading}
                  >
                    Түр хасах <DownOutlined />
                  </AntButton>
                </Tooltip>
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  const headerAction = (
    <Space>
      <AntButton
        icon={<ReloadOutlined />}
        onClick={() => fetchProducts(page)}
        loading={loading}
      >
        Сэргээх
      </AntButton>
      <Button
        variant="primary"
        onClick={() => setIsModalOpen(true)}
      >
        + Шинэ бүтээгдэхүүн
      </Button>
    </Space>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Бүтээгдэхүүн" action={headerAction} />

      <DataTable<Product>
        columns={columns}
        data={products}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: (p) => {
            setPage(p);
            fetchProducts(p);
          },
        }}
        emptyTitle="Одоогоор бүтээгдэхүүн алга байна"
        emptyDescription="Дээрх товчноос шинэ бүтээгдэхүүн нэмнэ үү."
      />

      <Modal
        title="Шинэ бүтээгдэхүүн нэмэх"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <Form.Item
            name="name"
            label="Бүтээгдэхүүний нэр"
            rules={[
              { required: true, message: "Бүтээгдэхүүний нэрийг оруулна уу" },
              { min: 2, message: "Нэр доод тал нь 2 тэмдэгт байх ёстой" },
            ]}
          >
            <Input placeholder="Бүтээгдэхүүний нэр оруулах" maxLength={100} />
          </Form.Item>

          <Form.Item
            name="price"
            label="Үнэ (₮)"
            rules={[
              { required: true, message: "Үнийг оруулна уу" },
              { type: "number", min: 0, message: "Үнэ эерэг тоо байх ёстой" },
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
            label="Нэгж"
            rules={[{ required: true, message: "Нэгжийг оруулна уу" }]}
          >
            <Input placeholder="жнь: ш, кг, хайрцаг" maxLength={20} />
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <AntButton onClick={() => setIsModalOpen(false)}>
                Цуцлах
              </AntButton>
              <AntButton type="primary" htmlType="submit" loading={submitting}>
                Нэмэх
              </AntButton>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
