"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Input, Button } from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(undefined);
    setFormError(null);

    if (!email) {
      setEmailError("Имэйл шаардлагатай");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setEmailError("Зөв имэйл оруулна уу");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/reset` },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch {
      setFormError("Холбоос илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <title>Нууц үг сэргээх | Merchant Portal</title>

      {sent ? (
        <div>
          <div className="w-14 h-14 rounded-full bg-[#D1FAE5] flex items-center justify-center mb-5">
            <CheckCircle2 className="w-7 h-7 text-[#059669]" />
          </div>
          <h1 className="text-2xl font-medium text-[#111827]">Имэйлээ шалгана уу</h1>
          <p className="text-[13px] text-[#6B7280] mt-1.5">
            Сэргээх холбоосыг{" "}
            <span className="font-medium text-[#111827]">{email}</span> хаягт илгээлээ.
            Холбоос 1 цагийн дотор хүчинтэй.
          </p>
          <p className="text-[13px] text-[#6B7280] mt-4">
            Имэйл ирээгүй юу? Спам фолдер шалгах эсвэл{" "}
            <button
              type="button"
              onClick={() => { setSent(false); setFormError(null); }}
              className="text-[#FF6B35] hover:underline font-medium"
            >
              дахин илгээх
            </button>
            .
          </p>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#FF6B35] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Нэвтрэх хуудас руу буцах
          </Link>
        </div>
      ) : (
        <div>
          <header className="mb-6">
            <h1 className="text-2xl font-medium text-[#111827]">Нууц үг сэргээх</h1>
            <p className="text-[13px] text-[#6B7280] mt-1.5">
              Имэйл хаягаа оруулвал сэргээх холбоос илгээнэ
            </p>
          </header>

          {formError && (
            <div
              role="alert"
              className="mb-4 p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg text-sm text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Имэйл"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(undefined); }}
              placeholder="name@company.mn"
              error={emailError}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              className="!h-11 mt-2"
            >
              {loading ? "Илгээж байна…" : "Холбоос илгээх"}
            </Button>
          </form>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#FF6B35] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Нэвтрэх хуудас руу буцах
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
