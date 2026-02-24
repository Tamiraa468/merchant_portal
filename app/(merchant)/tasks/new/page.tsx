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
  Divider,
  App,
  Empty,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ShoppingCartOutlined,
  EnvironmentOutlined,
  UserOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Product, CartItem } from "@/types/database";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface LocationFormValues {
  pickup_address: string;
  pickup_note?: string;
  dropoff_address: string;
  dropoff_note?: string;
  receiver_name: string;
  receiver_phone: string;
}

export default function NewDeliveryTaskPage() {
  const router = useRouter();
  const supabase = createClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<LocationFormValues>();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Fetch org_id and products
  const fetchInitialData = useCallback(async () => {
    setLoadingProducts(true);
    try {
      // Get current user's org_id
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

      // Fetch active products
      const { data: productsData, error } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching products:", error);
        message.error("Failed to load products");
      } else {
        setProducts(productsData || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      message.error("Failed to load data");
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase, router, message]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Add product to cart
  const handleAddToCart = () => {
    if (!selectedProductId) {
      message.warning("Please select a product");
      return;
    }

    if (quantity < 1) {
      message.warning("Quantity must be at least 1");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    // Check if product already in cart
    const existingIndex = cart.findIndex(
      (item) => item.product.id === selectedProductId,
    );

    if (existingIndex >= 0) {
      // Update quantity
      setCart((prev) =>
        prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        ),
      );
      message.success(`Updated ${product.name} quantity`);
    } else {
      // Add new item
      setCart((prev) => [...prev, { product, quantity }]);
      message.success(`Added ${product.name} to cart`);
    }

    // Reset selection
    setSelectedProductId(null);
    setQuantity(1);
  };

  // Remove item from cart
  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    message.info("Item removed from cart");
  };

  // Calculate cart total
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  // Submit delivery task
  const handleSubmit = async (values: LocationFormValues) => {
    if (!orgId) {
      message.error("Organization not found");
      return;
    }

    if (cart.length === 0) {
      message.error("Please add at least one product to the cart");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create pickup location (using your schema: org_id, address_text, note)
      console.log("Creating pickup location...");
      const { data: pickupLocation, error: pickupError } = await supabase
        .from("locations")
        .insert({
          org_id: orgId,
          address_text: values.pickup_address.trim(),
          label: "Pickup",
          note: values.pickup_note?.trim() || null,
        })
        .select()
        .single();

      if (pickupError) {
        console.error("Pickup location error:", pickupError);
        throw new Error(`Pickup location: ${pickupError.message}`);
      }
      console.log("Pickup location created:", pickupLocation.id);

      // 2. Create dropoff location
      console.log("Creating dropoff location...");
      const { data: dropoffLocation, error: dropoffError } = await supabase
        .from("locations")
        .insert({
          org_id: orgId,
          address_text: values.dropoff_address.trim(),
          label: "Dropoff",
          note: values.dropoff_note?.trim() || null,
        })
        .select()
        .single();

      if (dropoffError) {
        console.error("Dropoff location error:", dropoffError);
        throw new Error(`Dropoff location: ${dropoffError.message}`);
      }
      console.log("Dropoff location created:", dropoffLocation.id);

      // 3. Calculate package value from cart
      const packageValue = cart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );

      // 4. Create delivery task (status defaults to 'draft')
      console.log("Creating delivery task...");
      const { data: task, error: taskError } = await supabase
        .from("delivery_tasks")
        .insert({
          org_id: orgId,
          status: "draft",
          pickup_location_id: pickupLocation.id,
          dropoff_location_id: dropoffLocation.id,
          pickup_note: values.pickup_note?.trim() || null,
          dropoff_note: values.dropoff_note?.trim() || null,
          receiver_name: values.receiver_name?.trim() || null,
          receiver_phone: values.receiver_phone?.trim() || null,
          package_value: packageValue,
        })
        .select()
        .single();

      if (taskError) {
        console.error("Delivery task error:", taskError);
        throw new Error(`Delivery task: ${taskError.message}`);
      }
      console.log("Delivery task created:", task.id);

      // 5. Insert task items
      console.log("Creating task items...");
      const taskItems = cart.map((item) => ({
        task_id: task.id,
        product_id: item.product.id,
        qty: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("task_items")
        .insert(taskItems);

      if (itemsError) {
        console.error("Task items error:", itemsError);
        throw new Error(`Task items: ${itemsError.message}`);
      }
      console.log("Task items created successfully");

      message.success("Delivery task created successfully!");
      router.push(`/tasks/${task.id}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Error creating delivery task:", errorMessage, err);
      message.error(`Failed: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Cart table columns
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
    {
      title: "Quantity",
      dataIndex: "quantity",
      key: "quantity",
      align: "center",
    },
    {
      title: "Total",
      key: "total",
      render: (_, record) => (
        <Text strong>
          ₮{(record.product.price * record.quantity).toLocaleString()}
        </Text>
      ),
      align: "right",
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveFromCart(record.product.id)}
        />
      ),
      align: "center",
      width: 80,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeftOutlined className="text-lg" />
            </Link>
            <Title level={4} className="!mb-0">
              Create Delivery Task
            </Title>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark="optional"
        >
          {/* Location & Receiver Card */}
          <Card
            title={
              <Space>
                <EnvironmentOutlined />
                <span>Pickup & Dropoff Information</span>
              </Space>
            }
            className="mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pickup Section */}
              <div>
                <Title level={5} className="!text-blue-600">
                  📍 Pickup Location
                </Title>
                <Form.Item
                  name="pickup_address"
                  label="Pickup Address"
                  rules={[
                    { required: true, message: "Pickup address is required" },
                  ]}
                >
                  <TextArea
                    rows={2}
                    placeholder="Enter pickup address..."
                    maxLength={500}
                  />
                </Form.Item>
                <Form.Item name="pickup_note" label="Pickup Note">
                  <Input
                    placeholder="Optional note for pickup..."
                    maxLength={200}
                  />
                </Form.Item>
              </div>

              {/* Dropoff Section */}
              <div>
                <Title level={5} className="!text-green-600">
                  📍 Dropoff Location
                </Title>
                <Form.Item
                  name="dropoff_address"
                  label="Dropoff Address"
                  rules={[
                    { required: true, message: "Dropoff address is required" },
                  ]}
                >
                  <TextArea
                    rows={2}
                    placeholder="Enter dropoff address..."
                    maxLength={500}
                  />
                </Form.Item>
                <Form.Item name="dropoff_note" label="Dropoff Note">
                  <Input
                    placeholder="Optional note for dropoff..."
                    maxLength={200}
                  />
                </Form.Item>
              </div>
            </div>

            <Divider />

            {/* Receiver Info */}
            <Title level={5}>
              <UserOutlined className="mr-2" />
              Receiver Information
            </Title>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="receiver_name"
                label="Receiver Name"
                rules={[
                  { required: true, message: "Receiver name is required" },
                ]}
              >
                <Input placeholder="Enter receiver's name..." maxLength={100} />
              </Form.Item>
              <Form.Item
                name="receiver_phone"
                label="Receiver Phone"
                rules={[
                  { required: true, message: "Receiver phone is required" },
                  {
                    pattern: /^[0-9+\-\s()]+$/,
                    message: "Invalid phone number",
                  },
                ]}
              >
                <Input placeholder="Enter receiver's phone..." maxLength={20} />
              </Form.Item>
            </div>
          </Card>

          {/* Product Cart Card */}
          <Card
            title={
              <Space>
                <ShoppingCartOutlined />
                <span>Product Cart</span>
                {cart.length > 0 && (
                  <Text type="secondary">({cart.length} items)</Text>
                )}
              </Space>
            }
            className="mb-6"
          >
            {/* Product Selector */}
            <div className="flex flex-wrap gap-4 mb-6">
              <Select
                placeholder="Select a product..."
                value={selectedProductId}
                onChange={setSelectedProductId}
                loading={loadingProducts}
                className="flex-1 min-w-[200px]"
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)
                    ?.toLowerCase()
                    .includes(input.toLowerCase())
                }
              >
                {products.map((product) => (
                  <Select.Option key={product.id} value={product.id}>
                    {product.name} - ₮{product.price.toLocaleString()} /{" "}
                    {product.unit}
                  </Select.Option>
                ))}
              </Select>

              <InputNumber
                min={1}
                max={999}
                value={quantity}
                onChange={(val) => setQuantity(val || 1)}
                className="w-24"
                placeholder="Qty"
              />

              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddToCart}
                disabled={!selectedProductId}
              >
                Add to Cart
              </Button>
            </div>

            {/* Cart Table */}
            {cart.length > 0 ? (
              <>
                <Table
                  dataSource={cart}
                  columns={cartColumns}
                  rowKey={(record) => record.product.id}
                  pagination={false}
                  size="middle"
                />
                <div className="flex justify-end mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Space size="large">
                    <Text className="text-lg">Total:</Text>
                    <Text strong className="text-xl text-blue-600">
                      ₮{cartTotal.toLocaleString()}
                    </Text>
                  </Space>
                </div>
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No products in cart. Add products above."
              />
            )}
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Link href="/tasks">
              <Button size="large">Cancel</Button>
            </Link>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={submitting}
              disabled={cart.length === 0}
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
