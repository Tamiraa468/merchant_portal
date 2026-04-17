"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Form,
  Input,
  Switch,
  Button as AntButton,
  Space,
  Typography,
  TimePicker,
  App,
  Divider,
  Alert,
  Spin,
} from "antd";
import {
  ShopOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { OrgSettings, WeeklyHour } from "@/types/database";
import { DEFAULT_WEEKLY_HOURS, DAY_NAMES } from "@/types/database";
import { PageHeader } from "@/components/ui";

const { Text } = Typography;
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
  const [, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState<WeeklyHour[]>(DEFAULT_WEEKLY_HOURS);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const fetchSettings = useCallback(
    async (oid: string) => {
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
    },
    [supabase, form],
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
      const { error } = await supabase.from("org_settings").upsert({
        org_id: orgId,
        store_name: values.store_name?.trim() || null,
        store_address: values.store_address?.trim() || null,
        store_phone: values.store_phone?.trim() || null,
        store_description: values.store_description?.trim() || null,
        is_accepting_orders: !isPaused,
        weekly_hours: hours,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      message.success("Тохиргоо хадгалагдлаа");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Тохиргоо хадгалахад алдаа гарлаа";
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
      const { error } = await supabase.from("org_settings").upsert({
        org_id: orgId,
        is_accepting_orders: !newValue,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setIsPaused(newValue);
      message.success(newValue ? "Захиалга зогссон" : "Захиалга сэргэсэн");
    } catch {
      message.error("Төлөв шинэчлэхэд алдаа гарлаа");
    } finally {
      setPauseLoading(false);
    }
  };

  const updateHour = (
    day: number,
    field: "open" | "close" | "closed",
    value: string | boolean,
  ) => {
    setHours((prev) =>
      prev.map((h) => (h.day === day ? { ...h, [field]: value } : h)),
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader title="Дэлгүүрийн тохиргоо" />

      <Card
        className={isPaused ? "border-red-400 border-2" : ""}
        title={
          <Space>
            <PauseCircleOutlined
              style={{ color: isPaused ? "#ef4444" : undefined }}
            />
            <span>Захиалга хүлээн авах</span>
          </Space>
        }
      >
        {isPaused && (
          <Alert
            type="error"
            message="Захиалга одоогоор ЗОГССОН. Үйлчлүүлэгчид шинэ захиалга өгөх боломжгүй."
            className="mb-4"
            showIcon
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Text strong>
              {isPaused
                ? "Захиалга хүлээн авалт сэргээх"
                : "Бүх захиалгыг түр зогсоох"}
            </Text>
            <div className="text-sm text-gray-500 mt-1">
              {isPaused
                ? "Дахин захиалга хүлээн авахын тулд дарна уу."
                : "Яаралтай зогсоолт — завгүй эсвэл эрт хаах үед ашиглана уу."}
            </div>
          </div>
          <AntButton
            type={isPaused ? "primary" : "default"}
            danger={!isPaused}
            loading={pauseLoading}
            onClick={handleTogglePause}
            size="large"
          >
            {isPaused ? "Захиалга сэргээх" : "Бүх захиалгыг зогсоох"}
          </AntButton>
        </div>
      </Card>

      <Card
        title={
          <Space>
            <ShopOutlined />
            <span>Дэлгүүрийн мэдээлэл</span>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          requiredMark={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Form.Item name="store_name" label="Дэлгүүрийн нэр (заавал биш)">
              <Input placeholder="жишээ: Галын гал тогоо" maxLength={100} />
            </Form.Item>
            <Form.Item name="store_phone" label="Утасны дугаар (заавал биш)">
              <Input placeholder="+976 ..." maxLength={20} />
            </Form.Item>
          </div>
          <Form.Item name="store_address" label="Хаяг (заавал биш)">
            <Input placeholder="Бүтэн хаяг..." maxLength={300} />
          </Form.Item>
          <Form.Item name="store_description" label="Тайлбар (заавал биш)">
            <TextArea
              rows={3}
              placeholder="Үйлчлүүлэгчдэд харагдах богино тайлбар..."
              maxLength={500}
              showCount
            />
          </Form.Item>

          <div className="flex justify-end">
            <AntButton
              type="primary"
              htmlType="submit"
              loading={saving}
              icon={<SaveOutlined />}
            >
              Хадгалах
            </AntButton>
          </div>
        </Form>
      </Card>

      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>Ажлын цаг</span>
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
                checkedChildren="Нээлттэй"
                unCheckedChildren="Хаалттай"
                aria-label={`${DAY_NAMES[h.day]} нээлттэй/хаалттай төлөв`}
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
                    aria-label={`${DAY_NAMES[h.day]} нээх цаг`}
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
                    aria-label={`${DAY_NAMES[h.day]} хаах цаг`}
                  />
                </>
              )}
            </div>
          ))}
        </div>

        <Divider />

        <div className="flex justify-end">
          <AntButton
            type="primary"
            loading={saving}
            icon={<SaveOutlined />}
            onClick={async () => {
              if (!orgId) return;
              setSaving(true);
              try {
                const { error } = await supabase.from("org_settings").upsert({
                  org_id: orgId,
                  weekly_hours: hours,
                  updated_at: new Date().toISOString(),
                });
                if (error) throw error;
                message.success("Цаг хадгалагдлаа");
              } catch {
                message.error("Цаг хадгалахад алдаа гарлаа");
              } finally {
                setSaving(false);
              }
            }}
          >
            Хадгалах
          </AntButton>
        </div>
      </Card>
    </div>
  );
}
