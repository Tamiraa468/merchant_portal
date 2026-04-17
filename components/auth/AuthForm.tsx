"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Input, Button } from "@/components/ui";
import type { AuthFormData } from "@/types/database";

interface AuthFormProps {
  mode: "login" | "register";
  /**
   * Registration type — determines which app identifier is sent.
   * The DB trigger reads raw_user_meta_data->>'app' and assigns role.
   * - "merchant" => app = "merchant_portal" => role = "org_user"
   * - "courier"  => app = "courier_app"      => role = "courier"
   */
  registerType?: "merchant" | "courier";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function AuthForm({
  mode,
  registerType = "merchant",
}: AuthFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState<AuthFormData>({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (mode === "register" && !formData.fullName?.trim()) {
      errors.fullName = "Нэр шаардлагатай";
    }

    if (!formData.email) {
      errors.email = "Имэйл шаардлагатай";
    } else if (!EMAIL_RE.test(formData.email)) {
      errors.email = "Зөв имэйл оруулна уу";
    }

    if (!formData.password) {
      errors.password = "Нууц үг шаардлагатай";
    } else if (formData.password.length < 8) {
      errors.password = "Нууц үг 8-аас дээш тэмдэгттэй байна";
    }

    if (mode === "register" && formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Нууц үг таарахгүй байна";
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    try {
      if (mode === "register") {
        const appId = registerType === "courier" ? "courier_app" : "merchant_portal";
        const metadata = {
          full_name: formData.fullName?.trim() || "",
          app: appId,
        };

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: metadata,
            emailRedirectTo: `${window.location.origin}/auth/login`,
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          if (data.user.identities?.length === 0) {
            setFormError("Энэ имэйл аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү.");
          } else if (!data.session) {
            setSuccess("Бүртгэл амжилттай үүслээ! Имэйлээ шалгаж баталгаажуулна уу.");
          } else {
            redirectAfterAuth();
          }
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;
        if (data.session) redirectAfterAuth();
      }
    } catch (err: unknown) {
      const authError = err as { message?: string; status?: number };
      let msg = authError.message || "Алдаа гарлаа";

      if (authError.message?.includes("Invalid login credentials")) {
        msg = "Имэйл эсвэл нууц үг буруу байна";
      } else if (authError.message?.includes("Email not confirmed")) {
        msg = "Имэйл хаягаа баталгаажуулсны дараа нэвтэрнэ үү";
      } else if (authError.message?.includes("User already registered")) {
        msg = "Энэ имэйл аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү.";
      } else if (authError.status === 429) {
        msg = "Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.";
      } else if (authError.message?.includes("network")) {
        msg = "Сүлжээний алдаа. Холболтоо шалгана уу.";
      }

      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const redirectAfterAuth = () => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "/dashboard";
    router.push(redirect);
    router.refresh();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (fieldErrors[name as keyof FieldErrors]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (formError) setFormError(null);
  };

  const isLogin = mode === "login";
  const title = isLogin ? "Нэвтрэх" : "Бүртгэл үүсгэх";
  const subtitle = isLogin
    ? "Бүртгэлтэй имэйл, нууц үгээ оруулна уу"
    : "Худалдаачийн эрх авах";
  const submitLabel = isLogin ? "Нэвтрэх" : "Бүртгүүлэх";
  const submitLoadingLabel = isLogin ? "Нэвтэрч байна…" : "Үүсгэж байна…";

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-medium text-[#111827]">{title}</h1>
        <p className="text-[13px] text-[#6B7280] mt-1.5">{subtitle}</p>
      </header>

      {success && (
        <div
          role="status"
          className="mb-4 p-3 bg-[#D1FAE5] border border-[#6EE7B7] rounded-lg text-sm text-[#047857]"
        >
          {success}
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="mb-4 p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg text-sm text-[#B91C1C]"
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {!isLogin && (
          <Input
            label="Нэр"
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={formData.fullName}
            onChange={handleInputChange}
            placeholder="Болд Бат"
            error={fieldErrors.fullName}
          />
        )}

        <Input
          label="Имэйл"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleInputChange}
          placeholder="name@company.mn"
          error={fieldErrors.email}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#111827]">
              Нууц үг
            </label>
            {isLogin && (
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-[#FF6B35] hover:underline"
              >
                Мартсан уу?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={formData.password}
            onChange={handleInputChange}
            placeholder="••••••••"
            error={fieldErrors.password}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                aria-label={showPassword ? "Нууц үг нуух" : "Нууц үг харах"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        {!isLogin && (
          <Input
            label="Нууц үг баталгаажуулах"
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            placeholder="••••••••"
            error={fieldErrors.confirmPassword}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                aria-label={showConfirmPassword ? "Нууц үг нуух" : "Нууц үг харах"}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        )}

        {isLogin && (
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input
              type="checkbox"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={handleInputChange}
              className="w-4 h-4 rounded border-[#E5E7EB] accent-[#FF6B35]"
            />
            <span className="text-[13px] text-[#6B7280]">Намайг санах</span>
          </label>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          className="!h-11 mt-2"
        >
          {loading ? submitLoadingLabel : submitLabel}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#6B7280]">
        {isLogin ? (
          <>
            Бүртгэл байхгүй юу?{" "}
            <Link href="/auth/register" className="text-[#FF6B35] font-medium hover:underline">
              Бүртгэл үүсгэх
            </Link>
          </>
        ) : (
          <>
            Бүртгэлтэй юу?{" "}
            <Link href="/auth/login" className="text-[#FF6B35] font-medium hover:underline">
              Нэвтрэх
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
