"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Space, Typography, Alert, Spin } from "antd";
import {
  CheckCircleFilled,
  MailOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

const OTP_LENGTH      = 6;
const EXPIRY_SECONDS  = 10 * 60; // must match DB: 10 minutes
const RESEND_COOLDOWN = 60;

type EpodState =
  | "loading"    // checking DB for active OTP on mount
  | "awaiting"   // OTP active — waiting for digit input
  | "sending"    // resending OTP via Edge Function
  | "verifying"  // checking OTP via verify_epod_otp RPC
  | "success"    // verified — task completed
  | "expired"    // OTP expired — show resend
  | "locked";    // 5 wrong attempts

interface EpodVerificationProps {
  taskId: string;
  customerEmail?: string | null;
}

export default function EpodVerification({
  taskId,
  customerEmail,
}: EpodVerificationProps) {
  const supabase = createClient();

  const [epodState, setEpodState]           = useState<EpodState>("loading");
  const [digits, setDigits]                 = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError]                   = useState<string | null>(null);
  const [timeLeft, setTimeLeft]             = useState(EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (timerRef.current)  clearInterval(timerRef.current);
    if (resendRef.current) clearInterval(resendRef.current);
  }, []);

  // ── Timer helpers ──────────────────────────────────────────────────────
  const startExpiryCountdown = useCallback((seconds: number) => {
    setTimeLeft(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setEpodState("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN);
    if (resendRef.current) clearInterval(resendRef.current);
    resendRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(resendRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ── On mount: check DB for active OTP (auto-sent by trigger) ──────────
  useEffect(() => {
    let cancelled = false;

    async function checkActiveOtp() {
      try {
        const { data } = await supabase
          .from("delivery_epod_otps")
          .select("expires_at, attempts, verified")
          .eq("task_id", taskId)
          .eq("verified", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          const remaining = Math.max(
            0,
            Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000),
          );

          if (data.attempts >= 5) {
            setEpodState("locked");
          } else if (remaining > 0) {
            setEpodState("awaiting");
            startExpiryCountdown(remaining);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
          } else {
            setEpodState("expired");
          }
        } else {
          // No OTP found — trigger may still be in-flight; retry once after 2s
          setTimeout(async () => {
            if (cancelled) return;
            const { data: retry } = await supabase
              .from("delivery_epod_otps")
              .select("expires_at, attempts")
              .eq("task_id", taskId)
              .eq("verified", false)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cancelled) return;

            if (retry) {
              const rem = Math.max(
                0,
                Math.floor((new Date(retry.expires_at).getTime() - Date.now()) / 1000),
              );
              if (rem > 0) {
                setEpodState("awaiting");
                startExpiryCountdown(rem);
                setTimeout(() => inputRefs.current[0]?.focus(), 100);
              } else {
                setEpodState("expired");
              }
            } else {
              // Still nothing — show expired/resend state
              setEpodState("expired");
            }
          }, 2000);
        }
      } catch {
        if (!cancelled) setEpodState("expired");
      }
    }

    checkActiveOtp();
    return () => { cancelled = true; };
  }, [taskId, supabase, startExpiryCountdown]);

  // ── Resend OTP (manual) ────────────────────────────────────────────────
  const resendOtp = useCallback(async () => {
    setEpodState("sending");
    setError(null);
    setDigits(Array(OTP_LENGTH).fill(""));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-epod-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ task_id: taskId }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Server error ${res.status}`,
        );
      }

      setEpodState("awaiting");
      startExpiryCountdown(EXPIRY_SECONDS);
      startResendCooldown();
      setTimeout(() => inputRefs.current[0]?.focus(), 80);
    } catch (err: unknown) {
      setEpodState("expired");
      setError(err instanceof Error ? err.message : "Failed to resend code");
    }
  }, [taskId, supabase, startExpiryCountdown, startResendCooldown]);

  // ── Verify OTP ─────────────────────────────────────────────────────────
  const verifyOtp = useCallback(
    async (code: string) => {
      setEpodState("verifying");
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc("verify_epod_otp", {
          p_task_id: taskId,
          p_otp:     code,
        });

        if (rpcError) throw rpcError;
        if (!(data as { success?: boolean })?.success) throw new Error("Verification failed");

        if (timerRef.current) clearInterval(timerRef.current);
        setEpodState("success");
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message :
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);

        const isLocked =
          msg.toLowerCase().includes("too many") ||
          msg.toLowerCase().includes("locked");

        setEpodState(isLocked ? "locked" : "awaiting");
        setError(msg);
        setDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 80);
      }
    },
    [taskId, supabase],
  );

  // ── Digit input handlers ──────────────────────────────────────────────
  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next  = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== "")) {
      verifyOtp(next.join(""));
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (text.length === OTP_LENGTH) {
      e.preventDefault();
      setDigits(text.split(""));
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      verifyOtp(text);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const isVerifying    = epodState === "verifying";
  const inputsDisabled = isVerifying || epodState === "expired" || epodState === "locked";

  // ── Render: Loading ───────────────────────────────────────────────────
  if (epodState === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Spin size="large" />
        <Text type="secondary">Checking verification code…</Text>
      </div>
    );
  }

  // ── Render: Success ───────────────────────────────────────────────────
  if (epodState === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircleFilled style={{ fontSize: 56, color: "#22c55e" }} />
        <Title level={4} className="mb-0! text-green-600">
          Delivery Completed
        </Title>
        <Text type="secondary">
          ePOD verified. Courier earnings have been recorded.
        </Text>
      </div>
    );
  }

  // ── Render: Sending (resend in progress) ──────────────────────────────
  if (epodState === "sending") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <LoadingOutlined style={{ fontSize: 36, color: "#3b82f6" }} />
        <Text type="secondary">Sending new code to {customerEmail}…</Text>
      </div>
    );
  }

  // ── Render: Awaiting / Expired / Verifying / Locked ───────────────────
  return (
    <div className="flex flex-col items-center gap-5 py-6">
      {/* Auto-sent notice */}
      <div className="text-center">
        <MailOutlined style={{ fontSize: 24, color: "#3b82f6" }} />{" "}
        <Text type="secondary">Verification code sent to </Text>
        <Text strong>{customerEmail}</Text>
      </div>

      {/* Error / locked alert */}
      {error && (
        <Alert
          type={epodState === "locked" ? "error" : "warning"}
          description={error}
          showIcon
          className="w-full"
        />
      )}

      {/* Expired alert */}
      {epodState === "expired" && !error && (
        <Alert
          type="warning"
          description="Code has expired — click Resend to get a new one."
          showIcon
          className="w-full"
        />
      )}

      {/* 6-digit OTP inputs */}
      <div
        className="flex gap-2 sm:gap-3"
        onPaste={handlePaste}
        role="group"
        aria-label="Enter 6-digit verification code"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            pattern="\d"
            maxLength={1}
            value={digit}
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={inputsDisabled}
            className={[
              "w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-bold",
              "rounded-xl border-2 outline-none transition-all",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
              digit
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950"
                : "border-gray-300 bg-white dark:bg-gray-800",
              inputsDisabled ? "opacity-50 cursor-not-allowed" : "cursor-text",
            ].join(" ")}
          />
        ))}
      </div>

      {/* Verifying spinner */}
      {isVerifying && (
        <Space>
          <LoadingOutlined className="text-blue-500" />
          <Text type="secondary">Verifying…</Text>
        </Space>
      )}

      {/* Countdown */}
      {epodState === "awaiting" && timeLeft > 0 && (
        <Text type="secondary" className="text-sm tabular-nums">
          {"Expires in "}
          <Text
            strong
            className={timeLeft < 60 ? "text-orange-500!" : "text-blue-600!"}
          >
            {formatTime(timeLeft)}
          </Text>
        </Text>
      )}

      {/* Resend button */}
      {epodState !== "locked" && (
        <Button
          type="link"
          size="small"
          icon={<ReloadOutlined />}
          disabled={resendCooldown > 0 || isVerifying}
          onClick={resendOtp}
        >
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : "Resend Code"}
        </Button>
      )}

      {epodState === "locked" && (
        <Button type="primary" onClick={resendOtp}>
          Request New Code
        </Button>
      )}
    </div>
  );
}
