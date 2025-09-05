import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface FreemiusWebhookBody {
  event: string;
  user?: { email: string };
  plan_id?: string;
  plan?: { id: string };
  license?: { key: string };
}

// ✅ compute signature
function computeSignature(payload: string): string {
  const hmac = crypto.createHmac(
    "sha256",
    process.env.FREEMIUS_SECRET_KEY as string
  );
  hmac.update(payload, "utf-8");
  return hmac.digest("hex");
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const receivedSignature = req.headers.get("x-fs-signature");
    const expectedSignature = computeSignature(rawBody);

    console.log("📩 Freemius webhook received");
    console.log(
      "🔑 FREEMIUS_SECRET_KEY (first 6 chars):",
      process.env.FREEMIUS_SECRET_KEY?.slice(0, 6)
    );
    console.log("📦 Raw body:", rawBody);
    console.log("📬 Signature from Freemius:", receivedSignature);
    console.log("🧮 Signature we computed:", expectedSignature);

    // Compare signatures
    if (receivedSignature !== expectedSignature) {
      console.error("❌ Invalid signature - mismatch");
      // ⚠️ return 200 so Freemius doesn’t disable webhook during testing
      return NextResponse.json(
        { error: "Invalid signature", receivedSignature, expectedSignature },
        { status: 200 }
      );
    }

    // ✅ parse payload if signature matches
    const body = JSON.parse(rawBody) as FreemiusWebhookBody;
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
        break; // Free
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
