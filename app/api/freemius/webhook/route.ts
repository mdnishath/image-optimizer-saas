import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface FreemiusWebhookBody {
  type: string;
  plan_id?: string;
  plan?: { id: string };
  objects?: {
    user?: { email: string; public_key?: string };
    cart?: { email?: string; plan_id?: string };
  };
  license?: { key: string };
}

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
    console.log("📦 Raw body:", rawBody);
    console.log("📬 Signature from Freemius:", receivedSignature);
    console.log("🧮 Signature we computed:", expectedSignature);

    // Accept unsigned events like user.created (for free plans)
    if (receivedSignature) {
      if (receivedSignature.toLowerCase() !== expectedSignature.toLowerCase()) {
        console.error("❌ Invalid signature - mismatch");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
      console.log("✅ Signature valid");
    } else {
      console.warn("⚠️ No signature received, accepting unsigned event");
    }

    const body = JSON.parse(rawBody) as FreemiusWebhookBody;
    const { type, plan_id, plan, objects, license } = body;

    const userEmail = objects?.user?.email || objects?.cart?.email || null;

    if (!userEmail) {
      console.warn("⚠️ No email in this event, ignoring");
      return NextResponse.json({ ok: true });
    }

    // Decide credits based on plan
    const planId = plan_id || plan?.id || objects?.cart?.plan_id;
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
        credits = 0;
        break;
    }

    // Only handle real lifecycle events
    if (type === "subscription.created" || type === "payment.completed") {
      if (credits > 0) {
        await prisma.user.upsert({
          where: { email: userEmail },
          update: {
            credits: { increment: credits },
            apiKey: license?.key ?? objects?.user?.public_key ?? undefined,
          },
          create: {
            email: userEmail,
            credits,
            apiKey: license?.key ?? objects?.user?.public_key ?? null,
          },
        });
        console.log(`✅ Updated credits for ${userEmail} (+${credits})`);
      }
    }

    if (type === "user.created" && credits > 0) {
      await prisma.user.upsert({
        where: { email: userEmail },
        update: {},
        create: {
          email: userEmail,
          credits,
          apiKey: objects?.user?.public_key ?? null,
        },
      });
      console.log(`✅ Created free user ${userEmail} with ${credits} credits`);
    }

    // Ignore irrelevant events like cart.created, cart.abandoned, etc.
    if (
      type !== "subscription.created" &&
      type !== "payment.completed" &&
      type !== "user.created"
    ) {
      console.log(`ℹ️ Ignored event type: ${type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
