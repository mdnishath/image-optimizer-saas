import { NextResponse } from "next/server";

import crypto from "crypto";
import prisma from "@/lib/prisma";

interface FreemiusWebhookBody {
  event: string;
  user?: { email: string };
  plan_id?: string;
  plan?: { id: string };
  license?: { key: string };
}

// verify Freemius signature
function verifySignature(payload: string, signature: string | null): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac(
    "sha256",
    process.env.FREEMIUS_SECRET_KEY as string
  );
  hmac.update(payload, "utf-8");
  return hmac.digest("hex") === signature;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-fs-signature");

    if (!verifySignature(rawBody, signature)) {
      console.error("❌ Invalid Freemius signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as FreemiusWebhookBody;
    console.log("📩 Freemius webhook payload:", body);

    const { event, user, plan_id, plan, license } = body;
    if (!user?.email) {
      return NextResponse.json({ error: "No user email" }, { status: 400 });
    }

    // normalize planId
    const planId = plan_id || plan?.id;

    let credits = 0;
    switch (planId) {
      case "34244":
        credits = 100;
        break; // Free plan
      case "34240":
        credits = 5000;
        break; // Optimizer 5K
      case "34242":
        credits = 20000;
        break; // Optimizer 20K
      case "34243":
        credits = 1000000;
        break; // Optimizer 1M
      default:
        console.warn("⚠️ Unknown planId:", planId);
    }

    // handle subscription & payment events
    if (event === "subscription.created" || event === "payment.completed") {
      if (credits > 0) {
        const updated = await prisma.user.upsert({
          where: { email: user.email },
          update: {
            credits: { increment: credits },
            apiKey: license?.key ?? undefined,
          },
          create: {
            email: user.email,
            credits,
            apiKey: license?.key ?? null,
          },
        });
        console.log("✅ User credits updated:", updated.email, updated.credits);
      }
    }

    // handle license activation (updates apiKey)
    if (event === "license.activated") {
      if (license?.key) {
        const updated = await prisma.user.update({
          where: { email: user.email },
          data: { apiKey: license.key },
        });
        console.log("🔑 License key saved for:", updated.email);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
