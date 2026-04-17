import AuthForm from "@/components/auth/AuthForm";
import AuthLayout from "@/components/auth/AuthLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Бүртгэл үүсгэх | Merchant Portal",
  description: "Худалдаачийн шинэ эрх үүсгэх",
};

export default function RegisterPage() {
  return (
    <AuthLayout>
      <AuthForm mode="register" registerType="merchant" />
    </AuthLayout>
  );
}
