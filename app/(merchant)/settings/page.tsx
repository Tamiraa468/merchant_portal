"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Space,
  Typography,
  TimePicker,
  App,
  Divider,
  Alert,
  Spin,
} from "antd";
import {
  ArrowLeftOutlined,
  ShopOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { OrgSettings, WeeklyHour } from "@/types/database";
import { DEFAULT_WEEKLY_HOURS, DAY_NAMES } from "@/types/database";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface StoreFormValues {
  store_name: string;
  store_address: string;
  store_phone: string;
  store_description: string;
}

export default function SettingsPage() {
  const supabase = createClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<StoreFormValues>();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState<WeeklyHour[]>(DEFAULT_WEEKLY_HOURS);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const fetchSettings = useCallback(async (oid: string) => {
    const { data } = await supabase
      .from("org_settings")
      .select("*")
      .eq("org_id", oid)
      .maybeSingle();

    if (data) {
      setSettings(data as OrgSettings);
      setIsPaused(!data.is_accepting_orders);
      setHours(
        data.weekly_hours?.length ? data.weekly_hours : DEFAULT_WEEKLY_HOURS,
      );
      form.setFieldsValue({
        store_name: data.store_name ?? "",
        store_address: data.store_address ?? "",
        store_phone: data.store_phone ?? "",
        store_description: data.store_description ?? "",
      });
    }
  }, [supabase, form]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profile?.org_id) {
        setOrgId(profile.org_id);
        await fetchSettings(profile.org_id);
      }
      setLoading(false);
    };
    init();
  }, [supabase, fetchSettings]);

  const handleSave = async (values: StoreFormValues) => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("org_settings")
        .upsert({
          org_id: orgId,
          store_name: values.store_name.trim() || null,
          store_address: values.store_address.trim() || null,
          store_phone: values.store_phone.trim() || null,
          store_description: values.store_description.trim() || null,
          is_accepting_orders: !isPaused,
          weekly_hours: hours,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      message.success("Settings saved!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    if (!orgId) return;
    setPauseLoading(true);
    const newValue = !isPaused;
    try {
      const { error } = await supabase
        .from("org_settings")
        .upsert({
          org_id: orgId,
          is_accepting_orders: !newValue,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setIsPaused(newValue);
      message.success(newValue ? "Orders paused" : "Orders resumed");
    } catch {
      message.error("Failed to update order status");
    } finally {
      setPauseLoading(false);
    }
  };

  const updateHour = (day: number, field: "open" | "close" | "closed", value: string | boolean) => {
    setHours((prev) =>
      prev.map((h) => (h.day === day ? { ...h, [field]: value } : h)),
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
                aria-label="Back to dashboard"
              >
                <ArrowLeftOutlined />
              </Link>
              <Title level={4} className="mb-0!">Store Settings</Title>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Emergency pause */}
        <Card
          className={isPaused ? "border-red-400 border-2" : ""}
          title={
            <Space>
              <PauseCircleOutlined style={{ color: isPaused ? "#ef4444" : undefined }} />
              <span>Order Acceptance</span>
            </Space>
          }
        >
          {isPaused && (
            <Alert
              type="error"
              message="Orders are currently PAUSED. Customers cannot place new orders."
              className="mb-4"
              showIcon
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Text strong>{isPaused ? "Resume taking orders" : "Pause all orders"}</Text>
              <div className="text-sm text-gray-500 mt-1">
                {isPaused
                  ? "Click to start accepting orders again."
                  : "Emergency stop — use when you're overwhelmed or closing early."}
              </div>
            </div>
            <Button
              type={isPaused ? "primary" : "default"}
              danger={!isPaused}
              loading={pauseLoading}
              onClick={handleTogglePause}
              size="large"
              aria-label={isPaused ? "Resume orders" : "Pause all orders"}
            >
              {isPaused ? "Resume Orders" : "Pause All Orders"}
            </Button>
          </div>
        </Card>

        {/* Store info form */}
        <Card
          title={
            <Space>
              <ShopOutlined />
              <span>Store Information</span>
            </Space>
          }
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            requiredMark="optional"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Form.Item name="store_name" label="Store Name">
                <Input placeholder="e.g. Gal's Kitchen" maxLength={100} />
              </Form.Item>
              <Form.Item name="store_phone" label="Phone Number">
                <Input placeholder="+976 ..." maxLength={20} />
              </Form.Item>
            </div>
            <Form.Item name="store_address" label="Store Address">
              <Input placeholder="Full address..." maxLength={300} />
            </Form.Item>
            <Form.Item name="store_description" label="Description">
              <TextArea
                rows={3}
                placeholder="Brief description shown to customers..."
                maxLength={500}
                showCount
              />
            </Form.Item>

            <div className="flex justify-end">
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<SaveOutlined />}
              >
                Save Changes
              </Button>
            </div>
          </Form>
        </Card>

        {/* Operating hours */}
        <Card
          title={
            <Space>
              <ClockCircleOutlined />
              <span>Operating Hours</span>
            </Space>
          }
        >
          <div className="space-y-3">
            {hours.map((h) => (
              <div key={h.day} className="flex flex-wrap items-center gap-3">
                <div className="w-10 font-medium text-sm text-gray-700 dark:text-gray-300">
                  {DAY_NAMES[h.day]}
                </div>
                <Switch
                  checked={!h.closed}
                  onChange={(val) => updateHour(h.day, "closed", !val)}
                  checkedChildren="Open"
                  unCheckedChildren="Closed"
                  aria-label={`${DAY_NAMES[h.day]} open/closed toggle`}
                />
                {!h.closed && (
                  <>
                    <TimePicker
                      value={dayjs(h.open, "HH:mm")}
                      format="HH:mm"
                      minuteStep={15}
                      allowClear={false}
                      onChange={(val) =>
                        updateHour(h.day, "open", val ? val.format("HH:mm") : "09:00")
                      }
                      aria-label={`${DAY_NAMES[h.day]} opening time`}
                    />
                    <span className="text-gray-400">–</span>
                    <TimePicker
                      value={dayjs(h.close, "HH:mm")}
                      format="HH:mm"
                      minuteStep={15}
                      allowClear={false}
                      onChange={(val) =>
                        updateHour(h.day, "close", val ? val.format("HH:mm") : "21:00")
                      }
                      aria-label={`${DAY_NAMES[h.day]} closing time`}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <Divider />

          <div className="flex justify-end">
            <Button
              type="primary"
              loading={saving}
              icon={<SaveOutlined />}
              onClick={async () => {
                if (!orgId) return;
                setSaving(true);
                try {
                  const { error } = await supabase
                    .from("org_settings")
                    .upsert({
                      org_id: orgId,
                      weekly_hours: hours,
                      updated_at: new Date().toISOString(),
                    });
                  if (error) throw error;
                  message.success("Hours saved!");
                } catch {
                  message.error("Failed to save hours");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save Hours
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
