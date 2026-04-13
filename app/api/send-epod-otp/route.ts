import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GMAIL_USER = process.env.GMAIL_USER ?? "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? `Delivery <${GMAIL_USER}>`;

// Reusable transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const body = await req.json().catch(() => null);
    const task_id: string | undefined = body?.task_id;
    if (!task_id) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

    // Generate OTP via RPC (validates ownership, rate limits, stores hash)
    const { data: otpResult, error: rpcError } = await supabase.rpc(
      "request_epod_otp",
      { p_task_id: task_id },
    );

    if (rpcError) {
      console.error("[send-epod-otp] RPC error:", rpcError.message);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const result = otpResult as {
      otp: string;
      customer_email: string;
      expires_at: string;
    };

    // Send email
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.warn("[send-epod-otp] Gmail credentials not set — dev mode");
      console.log(`[send-epod-otp] OTP for task ${task_id}: ${result.otp}`);
    } else {
      const expiresLabel = new Date(result.expires_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      await transporter.sendMail({
        from: FROM_EMAIL,
        to: result.customer_email,
        subject: "Your Delivery Verification Code",
        html: buildEmailHtml(result.otp, expiresLabel),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[send-epod-otp] Unexpected error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Email template (same as before)
function buildEmailHtml(otp: string, expiresAt: string): string {
  const digitCells = otp
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;width:52px;height:64px;line-height:64px;` +
        `text-align:center;background:#EFF6FF;border:2px solid #3B82F6;` +
        `border-radius:10px;font-size:34px;font-weight:700;color:#1D4ED8;` +
        `font-family:monospace;margin:0 4px;">${d}</span>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Delivery Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;
              overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#2563EB;padding:32px 40px;">
      <p style="margin:0 0 6px;color:#BFDBFE;font-size:12px;
                letter-spacing:1.5px;text-transform:uppercase;">Delivery Diploma</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
        Your Delivery Verification Code
      </h1>
    </div>
    <div style="padding:40px;">
      <p style="margin:0 0 6px;color:#374151;font-size:16px;line-height:1.6;">
        Your delivery has arrived. Share the code below with the courier or merchant to confirm receipt:
      </p>
      <div style="text-align:center;margin:36px 0 28px;">
        ${digitCells}
      </div>
      <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;
                  padding:14px 18px;margin-bottom:28px;">
        <p style="margin:0;color:#92400E;font-size:14px;line-height:1.5;">
          ⏱ This code expires at <strong>${expiresAt}</strong> (10 minutes from now).
        </p>
      </div>
      <p style="margin:0;color:#9CA3AF;font-size:13px;line-height:1.6;">
        If you were not expecting a delivery, you can safely ignore this email.
        Do not share this code with anyone other than your courier or the merchant.
      </p>
    </div>
    <div style="border-top:1px solid #F3F4F6;padding:20px 40px;">
      <p style="margin:0;color:#D1D5DB;font-size:12px;text-align:center;">
        Electronic Proof of Delivery — Delivery Diploma
      </p>
    </div>
  </div>
</body>
</html>`;
}
