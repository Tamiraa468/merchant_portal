import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

// ── Environment ──────────────────────────────────────────────────────────────
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")!;
const GMAIL_USER         = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_EMAIL         = Deno.env.get("FROM_EMAIL") ?? `Delivery <${GMAIL_USER}>`;

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Pre-flight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Missing Authorization header" }, 401);
    }

    // Create a client that acts as the calling user (RLS enforced)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const task_id: string | undefined = body?.task_id;

    if (!task_id) {
      return respond({ error: "task_id is required" }, 400);
    }

    let otp: string;
    let customer_email: string;
    let expires_at: string;

    if (body?.auto_triggered && body?.otp && body?.customer_email) {
      // ── AUTO MODE: called by DB trigger via pg_net ────────────────────
      // OTP already generated and hashed by the trigger — just send email.
      otp            = body.otp;
      customer_email = body.customer_email;
      expires_at     = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      console.log(`[send-epod-otp] Auto-triggered for task ${task_id}`);
    } else {
      // ── MANUAL MODE: merchant clicks "Resend" ─────────────────────────
      // Generate OTP via RPC (validates ownership, rate limits, stores hash).
      const { data: otpResult, error: rpcError } = await supabase.rpc(
        "request_epod_otp",
        { p_task_id: task_id },
      );

      if (rpcError) {
        console.error("[send-epod-otp] RPC error:", rpcError.message);
        return respond({ error: rpcError.message }, 400);
      }

      const result = otpResult as {
        otp: string;
        customer_email: string;
        expires_at: string;
      };
      otp            = result.otp;
      customer_email = result.customer_email;
      expires_at     = result.expires_at;
    }

    // ── Send email via Gmail SMTP ───────────────────────────────────────────
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.warn("[send-epod-otp] Gmail credentials not set — dev mode, skipping email");
      console.log(`[send-epod-otp] OTP for task ${task_id}: ${otp}`);
    } else {
      const expiresLabel = new Date(expires_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      });

      await transporter.sendMail({
        from: FROM_EMAIL,
        to: customer_email,
        subject: "Your Delivery Verification Code",
        html: buildEmailHtml(otp, expiresLabel),
      });
    }

    // Never echo the OTP back to the client
    return respond({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[send-epod-otp] Unexpected error:", msg);
    return respond({ error: msg }, 500);
  }
});

// ── Email template ────────────────────────────────────────────────────────────
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

    <!-- Header -->
    <div style="background:#2563EB;padding:32px 40px;">
      <p style="margin:0 0 6px;color:#BFDBFE;font-size:12px;
                letter-spacing:1.5px;text-transform:uppercase;">Delivery Diploma</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
        Your Delivery Verification Code
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <p style="margin:0 0 6px;color:#374151;font-size:16px;line-height:1.6;">
        Your delivery has arrived. Share the code below with the courier or merchant to confirm receipt:
      </p>

      <!-- OTP digits -->
      <div style="text-align:center;margin:36px 0 28px;">
        ${digitCells}
      </div>

      <!-- Expiry notice -->
      <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;
                  padding:14px 18px;margin-bottom:28px;">
        <p style="margin:0;color:#92400E;font-size:14px;line-height:1.5;">
          ⏱ This code expires at <strong>${expiresAt}</strong> (15 minutes from now).
        </p>
      </div>

      <p style="margin:0;color:#9CA3AF;font-size:13px;line-height:1.6;">
        If you were not expecting a delivery, you can safely ignore this email.
        Do not share this code with anyone other than your courier or the merchant.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #F3F4F6;padding:20px 40px;">
      <p style="margin:0;color:#D1D5DB;font-size:12px;text-align:center;">
        Electronic Proof of Delivery — Delivery Diploma
      </p>
    </div>
  </div>
</body>
</html>`;
}
