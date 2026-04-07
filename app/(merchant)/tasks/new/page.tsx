"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Form,
  Input,
  Button,
  Card,
  Select,
  InputNumber,
  Table,
  Space,
  Typography,
  App,
  Empty,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ShoppingCartOutlined,
  EnvironmentOutlined,
  UserOutlined,
  ArrowLeftOutlined,
  DollarOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Product, CartItem } from "@/types/database";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface TaskFormValues {
  pickup_address: string;
  pickup_note?: string;
  dropoff_address: string;
  dropoff_note?: string;
  receiver_name: string;
  receiver_phone: string;
  customer_email: string;
  delivery_fee: number;
  note?: string;
}

export default function NewDeliveryTaskPage() {
  const router = useRouter();
  const supabase = createClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<TaskFormValues>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) { router.push("/onboarding/organization"); return; }
      setOrgId(profile.org_id);

      const { data: productsData, error } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        message.error("Failed to load products");
      } else {
        setProducts(productsData || []);
      }
    } catch {
      message.error("Failed to load data");
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase, router, message]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  const handleAddToCart = () => {
    if (!selectedProductId) { message.warning("Please select a product"); return; }
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const existingIndex = cart.findIndex((item) => item.product.id === selectedProductId);
    if (existingIndex >= 0) {
      setCart((prev) =>
        prev.map((item, i) =>
          i === existingIndex ? { ...item, quantity: item.quantity + quantity } : item
        )
      );
    } else {
      setCart((prev) => [...prev, { product, quantity }]);
    }
    message.success(`Added ${product.name}`);
    setSelectedProductId(null);
    setQuantity(1);
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const handleSubmit = async (values: TaskFormValues) => {
    if (!orgId) { message.error("Organization not found"); return; }

    setSubmitting(true);
    try {
      // Build cart_items JSONB array for atomic insertion inside the RPC
      const cartItems = cart.length > 0
        ? cart.map((item) => ({ product_id: item.product.id, qty: item.quantity }))
        : null;

      const { data: taskData, error: rpcError } = await supabase.rpc(
        "create_delivery_task",
        {
          p_pickup_address:  values.pickup_address.trim(),
          p_dropoff_address: values.dropoff_address.trim(),
          p_customer_email:  values.customer_email.trim(),
          p_delivery_fee:    values.delivery_fee,
          p_customer_name:   values.receiver_name?.trim() || null,
          p_customer_phone:  values.receiver_phone?.trim() || null,
          p_pickup_note:     values.pickup_note?.trim() || null,
          p_dropoff_note:    values.dropoff_note?.trim() || null,
          p_note:            values.note?.trim() || null,
          p_cart_items:      cartItems,
        }
      );

      if (rpcError) throw rpcError;

      const task = taskData as { id: string };
      message.success("Delivery task created!");
      router.push(`/tasks/${task.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message :
        (typeof err === "object" && err !== null && "message" in err)
          ? String((err as { message: unknown }).message)
          : String(err);
      message.error(`Failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cartColumns: ColumnsType<CartItem> = [
    {
      title: "Product",
      dataIndex: ["product", "name"],
      key: "name",
    },
    {
      title: "Unit Price",
      dataIndex: ["product", "price"],
      key: "price",
      render: (price: number) => `₮${price.toLocaleString()}`,
      align: "right",
    },
    { title: "Qty", dataIndex: "quantity", key: "quantity", align: "center" },
    {
      title: "Total",
      key: "total",
      render: (_, record) => (
        <Text strong>₮{(record.product.price * record.quantity).toLocaleString()}</Text>
      ),
      align: "right",
    },
    {
      title: "",
      key: "action",
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveFromCart(record.product.id)}
          aria-label={`Remove ${record.product.name}`}
        />
      ),
      width: 48,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="text-gray-500 hover:text-gray-700"
              aria-label="Back to tasks"
            >
              <ArrowLeftOutlined className="text-lg" />
            </Link>
            <Title level={4} className="mb-0!">Create Delivery Task</Title>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark="optional">

          {/* ── Pickup & Dropoff ── */}
          <Card
            title={
              <Space>
                <EnvironmentOutlined aria-hidden="true" />
                <span>Pickup &amp; Dropoff</span>
              </Space>
            }
            className="mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Title level={5} className="text-blue-600!">Pickup Location</Title>
                <Form.Item
                  name="pickup_address"
                  label="Pickup Address"
                  rules={[{ required: true, message: "Pickup address is required" }]}
                >
                  <TextArea rows={2} placeholder="Enter pickup address…" maxLength={500} />
                </Form.Item>
                <Form.Item name="pickup_note" label="Pickup Note">
                  <Input placeholder="Optional note for pickup…" maxLength={200} />
                </Form.Item>
              </div>

              <div>
                <Title level={5} className="text-green-600!">Dropoff Location</Title>
                <Form.Item
                  name="dropoff_address"
                  label="Dropoff Address"
                  rules={[{ required: true, message: "Dropoff address is required" }]}
                >
                  <TextArea rows={2} placeholder="Enter dropoff address…" maxLength={500} />
                </Form.Item>
                <Form.Item name="dropoff_note" label="Dropoff Note">
                  <Input placeholder="Optional note for dropoff…" maxLength={200} />
                </Form.Item>
              </div>
            </div>
          </Card>

          {/* ── Customer / Receiver ── */}
          <Card
            title={
              <Space>
                <UserOutlined aria-hidden="true" />
                <span>Customer &amp; Receiver</span>
              </Space>
            }
            className="mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="receiver_name"
                label="Receiver Name"
                rules={[{ required: true, message: "Receiver name is required" }]}
              >
                <Input placeholder="Full name…" maxLength={100} />
              </Form.Item>
              <Form.Item
                name="receiver_phone"
                label="Receiver Phone"
                rules={[
                  { required: true, message: "Phone is required" },
                  { pattern: /^[0-9+\-\s()]+$/, message: "Invalid phone number" },
                ]}
              >
                <Input placeholder="+976 …" maxLength={20} />
              </Form.Item>
            </div>

            <Form.Item
              name="customer_email"
              label={
                <Space>
                  Customer Email
                  <Tooltip title="The OTP confirmation code will be sent here when the courier marks the package delivered.">
                    <InfoCircleOutlined className="text-gray-400" />
                  </Tooltip>
                </Space>
              }
              rules={[
                { required: true, message: "Customer email is required" },
                { type: "email", message: "Enter a valid email address" },
              ]}
            >
              <Input
                placeholder="customer@example.com"
                maxLength={200}
                type="email"
              />
            </Form.Item>
          </Card>

          {/* ── Delivery Fee ── */}
          <Card
            title={
              <Space>
                <DollarOutlined aria-hidden="true" />
                <span>Delivery Fee</span>
              </Space>
            }
            className="mb-6"
          >
            <Form.Item
              name="delivery_fee"
              label={
                <Space>
                  Delivery Fee (₮)
                  <Tooltip title="Amount the courier earns for completing this delivery. Must be greater than 0.">
                    <InfoCircleOutlined className="text-gray-400" />
                  </Tooltip>
                </Space>
              }
              rules={[
                { required: true, message: "Delivery fee is required" },
                {
                  validator: (_, value) =>
                    value && value > 0
                      ? Promise.resolve()
                      : Promise.reject(new Error("Delivery fee must be greater than 0")),
                },
              ]}
            >
              <InputNumber
                min={1}
                step={500}
                placeholder="e.g. 5000"
                className="w-full"
                formatter={(v) => `₮ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                parser={(v: any) => Number(String(v).replace(/₮\s?|(,*)/g, ""))}
              />
            </Form.Item>
            <p className="text-sm text-gray-500 -mt-2">
              Couriers see this amount before claiming the task.
            </p>
          </Card>

          {/* ── Product Cart (optional) ── */}
          <Card
            title={
              <Space>
                <ShoppingCartOutlined aria-hidden="true" />
                <span>Product Cart</span>
                {cart.length > 0 && (
                  <Text type="secondary">({cart.length} items)</Text>
                )}
                <Text type="secondary" className="text-xs!">(optional)</Text>
              </Space>
            }
            className="mb-6"
          >
            <div className="flex flex-wrap gap-3 mb-6" role="group" aria-label="Add product to cart">
              <Select
                placeholder="Select a product…"
                value={selectedProductId}
                onChange={setSelectedProductId}
                loading={loadingProducts}
                className="flex-1 min-w-48"
                showSearch
                optionFilterProp="label"
                allowClear
              >
                {products.map((product) => (
                  <Select.Option key={product.id} value={product.id}>
                    {product.name} — ₮{product.price.toLocaleString()} / {product.unit}
                  </Select.Option>
                ))}
              </Select>
              <InputNumber
                min={1}
                max={999}
                value={quantity}
                onChange={(val) => setQuantity(val || 1)}
                className="w-24"
                aria-label="Quantity"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddToCart}
                disabled={!selectedProductId}
              >
                Add
              </Button>
            </div>

            {cart.length > 0 ? (
              <>
                <Table
                  dataSource={cart}
                  columns={cartColumns}
                  rowKey={(r) => r.product.id}
                  pagination={false}
                  size="small"
                  scroll={{ x: "max-content" }}
                />
                <div className="flex justify-end mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Space size="large">
                    <Text>Cart Total:</Text>
                    <Text strong className="text-blue-600">
                      ₮{cartTotal.toLocaleString()}
                    </Text>
                  </Space>
                </div>
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No products added — you can still create the task."
              />
            )}
          </Card>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-4">
            <Link href="/tasks">
              <Button size="large">Cancel</Button>
            </Link>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={submitting}
              icon={<PlusOutlined />}
            >
              Create Delivery Task
            </Button>
          </div>
        </Form>
      </main>
    </div>
  );
}
