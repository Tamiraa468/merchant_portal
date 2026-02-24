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
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
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

export default function ProductsClient({ orgId }: ProductsClientProps) {
  const { message } = App.useApp();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [form] = Form.useForm<ProductFormValues>();

  // Fetch products for the organization
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching products:", error);
        message.error("Failed to load products");
      } else {
        setProducts(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
      message.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [message, orgId]);

  // Initial data fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Refresh products
  const handleRefresh = () => {
    fetchProducts();
  };

  // Open add product modal
  const showAddModal = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  // Close modal
  const handleCancel = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  // Submit new product
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

      if (error) {
        console.error("Error adding product:", error);
        message.error("Failed to add product");
      } else {
        message.success("Product added successfully");
        setProducts((prev) => [data, ...prev]);
        setIsModalOpen(false);
        form.resetFields();
      }
    } catch (err) {
      console.error("Failed to add product:", err);
      message.error("Failed to add product");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle product active status
  const handleToggleActive = async (product: Product) => {
    const newStatus = !product.is_active;

    // Optimistic update
    setTogglingIds((prev) => new Set(prev).add(product.id));
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, is_active: newStatus } : p,
      ),
    );

    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: newStatus })
        .eq("id", product.id);

      if (error) {
        // Revert on error
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, is_active: !newStatus } : p,
          ),
        );
        console.error("Error toggling product:", error);
        message.error("Failed to update product status");
      } else {
        message.success(
          `Product ${newStatus ? "activated" : "deactivated"} successfully`,
        );
      }
    } catch (err) {
      // Revert on error
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_active: !newStatus } : p,
        ),
      );
      console.error("Failed to toggle product:", err);
      message.error("Failed to update product status");
    } finally {
      setTogglingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  // Table columns
  const columns: ColumnsType<Product> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      render: (price: number) => `$${price.toFixed(2)}`,
      sorter: (a, b) => a.price - b.price,
    },
    {
      title: "Unit",
      dataIndex: "unit",
      key: "unit",
    },
    {
      title: "Status",
      dataIndex: "is_active",
      key: "status",
      render: (isActive: boolean) => (
        <Tag color={isActive ? "green" : "default"}>
          {isActive ? "Active" : "Inactive"}
        </Tag>
      ),
      filters: [
        { text: "Active", value: true },
        { text: "Inactive", value: false },
      ],
      onFilter: (value, record) => record.is_active === value,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Switch
          checked={record.is_active}
          onChange={() => handleToggleActive(record)}
          loading={togglingIds.has(record.id)}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Products
              </h1>
              <nav className="hidden md:flex items-center gap-4">
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/tasks"
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-sm font-medium"
                >
                  Tasks
                </Link>
                <Link
                  href="/products"
                  className="text-blue-600 dark:text-blue-400 text-sm font-medium"
                >
                  Products
                </Link>
              </nav>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Product Management
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your organization&apos;s products
            </p>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={showAddModal}
            >
              Add Product
            </Button>
          </Space>
        </div>

        {/* Products Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <Table
            columns={columns}
            dataSource={products}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} products`,
            }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    <span className="text-gray-500 dark:text-gray-400">
                      No products yet. Click &quot;Add Product&quot; to create
                      one.
                    </span>
                  }
                />
              ),
            }}
          />
        </div>
      </main>

      {/* Add Product Modal */}
      <Modal
        title="Add New Product"
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
        >
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
            label="Price"
            rules={[
              { required: true, message: "Please enter the price" },
              {
                type: "number",
                min: 0,
                message: "Price must be a positive number",
              },
            ]}
          >
            <InputNumber
              placeholder="0.00"
              min={0}
              step={0.01}
              precision={2}
              prefix="$"
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

          <Form.Item className="mb-0 flex justify-end gap-2">
            <Space>
              <Button onClick={handleCancel}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Add Product
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
