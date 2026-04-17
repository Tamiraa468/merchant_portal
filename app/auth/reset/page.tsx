"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Input, Button } from "@/components/ui";

interface FieldErrors {
  password?: string;
  confirm?: string;
}

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      } else {
        setFormError("Энэхүү холбоос хүчингүй эсвэл хугацаа дууссан байна.");
      }
    });
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!password) errors.password = "Нууц үг шаардлагатай";
    else if (password.length < 8) errors.password = "Нууц үг 8-аас дээш тэмдэгттэй байна";
    if (!confirm) errors.confirm = "Баталгаажуулна уу";
    else if (password !== confirm) errors.confirm = "Нууц үг таарахгүй байна";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch {
      setFormError("Нууц үг шинэчлэхэд алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <title>Шинэ нууц үг | Merchant Portal</title>

      {success ? (
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#D1FAE5] flex items-center justify-center mb-5">
            <CheckCircle2 className="w-7 h-7 text-[#059669]" />
          </div>
          <h1 className="text-2xl font-medium text-[#111827]">Амжилттай шинэчлэгдлээ</h1>
          <p className="text-[13px] text-[#6B7280] mt-1.5">
            Нэвтрэх хуудас руу шилжүүлж байна…
          </p>
        </div>
      ) : (
        <div>
          <header className="mb-6">
            <h1 className="text-2xl font-medium text-[#111827]">Шинэ нууц үг</h1>
            <p className="text-[13px] text-[#6B7280] mt-1.5">
              Шинэ нууц үгээ оруулна уу
            </p>
          </header>

          {formError && (
            <div
              role="alert"
              className="mb-4 p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg text-sm text-[#B91C1C]"
            >
              {formError}{" "}
              {!sessionReady && (
                <Link href="/auth/forgot-password" className="underline font-medium">
                  Шинэ холбоос авах
                </Link>
              )}
            </div>
          )}

          {sessionReady && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input
                label="Шинэ нууц үг"
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                placeholder="Дор хаяж 8 тэмдэгт"
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

              <Input
                label="Баталгаажуулах"
                id="confirm"
                name="confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setFieldErrors((p) => ({ ...p, confirm: undefined })); }}
                placeholder="Нууц үгээ давтан оруулна уу"
                error={fieldErrors.confirm}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                    aria-label={showConfirm ? "Нууц үг нуух" : "Нууц үг харах"}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                className="!h-11 mt-2"
              >
                {loading ? "Хадгалж байна…" : "Хадгалах"}
              </Button>
            </form>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
