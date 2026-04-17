"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Form,
  Input,
  Button as AntButton,
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
  DollarOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Product, CartItem } from "@/types/database";
import { PageHeader } from "@/components/ui";

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) {
        router.push("/onboarding/organization");
        return;
      }
      setOrgId(profile.org_id);

      const { data: productsData, error } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        message.error("Бүтээгдэхүүн ачаалахад алдаа гарлаа");
      } else {
        setProducts(productsData || []);
      }
    } catch {
      message.error("Өгөгдөл ачаалахад алдаа гарлаа");
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase, router, message]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleAddToCart = () => {
    if (!selectedProductId) {
      message.warning("Бүтээгдэхүүн сонгоно уу");
      return;
    }
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const existingIndex = cart.findIndex((item) => item.product.id === selectedProductId);
    if (existingIndex >= 0) {
      setCart((prev) =>
        prev.map((item, i) =>
          i === existingIndex ? { ...item, quantity: item.quantity + quantity } : item,
        ),
      );
    } else {
      setCart((prev) => [...prev, { product, quantity }]);
    }
    message.success(`${product.name} нэмэгдлээ`);
    setSelectedProductId(null);
    setQuantity(1);
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  const handleSubmit = async (values: TaskFormValues) => {
    if (!orgId) {
      message.error("Байгууллага олдсонгүй");
      return;
    }

    setSubmitting(true);
    try {
      const cartItems =
        cart.length > 0
          ? cart.map((item) => ({ product_id: item.product.id, qty: item.quantity }))
          : null;

      const { data: taskData, error: rpcError } = await supabase.rpc(
        "create_delivery_task",
        {
          p_pickup_address: values.pickup_address.trim(),
          p_dropoff_address: values.dropoff_address.trim(),
          p_customer_email: values.customer_email.trim(),
          p_delivery_fee: values.delivery_fee,
          p_customer_name: values.receiver_name?.trim() || null,
          p_customer_phone: values.receiver_phone?.trim() || null,
          p_pickup_note: values.pickup_note?.trim() || null,
          p_dropoff_note: values.dropoff_note?.trim() || null,
          p_note: values.note?.trim() || null,
          p_cart_items: cartItems,
        },
      );

      if (rpcError) throw rpcError;

      const task = taskData as { id: string };
      message.success("Хүргэлтийн даалгавар үүсгэгдлээ");
      router.push(`/tasks/${task.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      message.error(`Алдаа гарлаа: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cartColumns: ColumnsType<CartItem> = [
    {
      title: "Бүтээгдэхүүн",
      dataIndex: ["product", "name"],
      key: "name",
    },
    {
      title: "Нэгж үнэ",
      dataIndex: ["product", "price"],
      key: "price",
      render: (price: number) => `₮${price.toLocaleString()}`,
      align: "right",
    },
    { title: "Тоо", dataIndex: "quantity", key: "quantity", align: "center" },
    {
      title: "Нийт",
      key: "total",
      render: (_, record) => (
        <Text strong>
          ₮{(record.product.price * record.quantity).toLocaleString()}
        </Text>
      ),
      align: "right",
    },
    {
      title: "",
      key: "action",
      render: (_, record) => (
        <AntButton
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveFromCart(record.product.id)}
          aria-label={`${record.product.name} хасах`}
        />
      ),
      width: 48,
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader title="Шинэ даалгавар үүсгэх" backHref="/tasks" />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Card
          title={
            <Space>
              <EnvironmentOutlined aria-hidden="true" />
              <span>Авах ба Хүргэх</span>
            </Space>
          }
          className="mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Title level={5} className="text-blue-600!">
                Авах цэг
              </Title>
              <Form.Item
                name="pickup_address"
                label="Авах хаяг"
                rules={[{ required: true, message: "Авах хаяг оруулна уу" }]}
              >
                <TextArea
                  rows={2}
                  placeholder="Авах хаяг оруулах..."
                  maxLength={500}
                />
              </Form.Item>
              <Form.Item name="pickup_note" label="Авах тэмдэглэл">
                <Input
                  placeholder="Авах цэгийн тэмдэглэл (заавал биш)..."
                  maxLength={200}
                />
              </Form.Item>
            </div>

            <div>
              <Title level={5} className="text-green-600!">
                Хүргэх цэг
              </Title>
              <Form.Item
                name="dropoff_address"
                label="Хүргэх хаяг"
                rules={[{ required: true, message: "Хүргэх хаяг оруулна уу" }]}
              >
                <TextArea
                  rows={2}
                  placeholder="Хүргэх хаяг оруулах..."
                  maxLength={500}
                />
              </Form.Item>
              <Form.Item name="dropoff_note" label="Хүргэх тэмдэглэл">
                <Input
                  placeholder="Хүргэх цэгийн тэмдэглэл (заавал биш)..."
                  maxLength={200}
                />
              </Form.Item>
            </div>
          </div>
        </Card>

        <Card
          title={
            <Space>
              <UserOutlined aria-hidden="true" />
              <span>Үйлчлүүлэгч ба Хүлээн авагч</span>
            </Space>
          }
          className="mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Form.Item
              name="receiver_name"
              label="Хүлээн авагчийн нэр"
              rules={[
                { required: true, message: "Хүлээн авагчийн нэрийг оруулна уу" },
              ]}
            >
              <Input placeholder="Бүтэн нэр..." maxLength={100} />
            </Form.Item>
            <Form.Item
              name="receiver_phone"
              label="Хүлээн авагчийн утас"
              rules={[
                { required: true, message: "Утасны дугаарыг оруулна уу" },
                { pattern: /^[0-9+\-\s()]+$/, message: "Утасны дугаар буруу байна" },
              ]}
            >
              <Input placeholder="+976 ..." maxLength={20} />
            </Form.Item>
          </div>

          <Form.Item
            name="customer_email"
            label={
              <Space>
                Үйлчлүүлэгчийн имэйл
                <Tooltip title="Жолооч багц хүргэгдсэн гэж тэмдэглэх үед баталгаажуулах OTP код энэ хаяг руу илгээгдэнэ.">
                  <InfoCircleOutlined className="text-gray-400" />
                </Tooltip>
              </Space>
            }
            rules={[
              { required: true, message: "Үйлчлүүлэгчийн имэйлийг оруулна уу" },
              { type: "email", message: "Зөв имэйл хаяг оруулна уу" },
            ]}
          >
            <Input
              placeholder="customer@example.com"
              maxLength={200}
              type="email"
            />
          </Form.Item>
        </Card>

        <Card
          title={
            <Space>
              <DollarOutlined aria-hidden="true" />
              <span>Хүргэлтийн төлбөр</span>
            </Space>
          }
          className="mb-6"
        >
          <Form.Item
            name="delivery_fee"
            label={
              <Space>
                Хүргэлтийн төлбөр (₮)
                <Tooltip title="Энэ хүргэлтийг хийсэн жолоочид олгох мөнгөний хэмжээ. 0-ээс их байх ёстой.">
                  <InfoCircleOutlined className="text-gray-400" />
                </Tooltip>
              </Space>
            }
            rules={[
              { required: true, message: "Хүргэлтийн төлбөрийг оруулна уу" },
              {
                validator: (_, value) =>
                  value && value > 0
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error("Хүргэлтийн төлбөр 0-ээс их байх ёстой"),
                      ),
              },
            ]}
          >
            <InputNumber
              min={1}
              step={500}
              placeholder="жишээ: 5000"
              className="w-full"
              formatter={(v) => `₮ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              parser={(v: any) => Number(String(v).replace(/₮\s?|(,*)/g, ""))}
            />
          </Form.Item>
          <p className="text-sm text-gray-500 -mt-2">
            Жолооч даалгаврыг авахаасаа өмнө энэ дүнг харна.
          </p>
        </Card>

        <Card
          title={
            <Space>
              <ShoppingCartOutlined aria-hidden="true" />
              <span>Бүтээгдэхүүний сагс</span>
              {cart.length > 0 && (
                <Text type="secondary">({cart.length} бараа)</Text>
              )}
              <Text type="secondary" className="text-xs!">
                (заавал биш)
              </Text>
            </Space>
          }
          className="mb-6"
        >
          <div
            className="flex flex-wrap gap-3 mb-6"
            role="group"
            aria-label="Сагсанд бүтээгдэхүүн нэмэх"
          >
            <Select
              placeholder="Бүтээгдэхүүн сонгох..."
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
              aria-label="Тоо"
            />
            <AntButton
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddToCart}
              disabled={!selectedProductId}
            >
              Нэмэх
            </AntButton>
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
                  <Text>Сагсны нийт дүн:</Text>
                  <Text strong className="text-blue-600">
                    ₮{cartTotal.toLocaleString()}
                  </Text>
                </Space>
              </div>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Бүтээгдэхүүн нэмээгүй — та даалгавраа үүсгэх боломжтой."
            />
          )}
        </Card>

        <div className="flex justify-end gap-4">
          <Link href="/tasks">
            <AntButton size="large">Цуцлах</AntButton>
          </Link>
          <AntButton
            type="primary"
            htmlType="submit"
            size="large"
            loading={submitting}
            icon={<PlusOutlined />}
          >
            Даалгавар үүсгэх
          </AntButton>
        </div>
      </Form>
    </div>
  );
}
