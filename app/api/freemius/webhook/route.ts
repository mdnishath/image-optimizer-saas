import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface FreemiusWebhookBody {
  type: string;
  user_id?: string;
  plan_id?: string;
  plan?: { id: string };
  objects?: { user?: { email: string; public_key?: string } };
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

    // Log everything
    console.log("📩 Freemius webhook received");
    console.log("📦 Raw body:", rawBody);
    console.log("📬 Signature from Freemius:", receivedSignature);
    console.log("🧮 Signature we computed:", expectedSignature);

    // Allow unsigned events (like user.created)
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

    // Parse body
    const body = JSON.parse(rawBody) as FreemiusWebhookBody;
    const { type, plan_id, plan, objects, license } = body;
    const userEmail = objects?.user?.email;

    if (!userEmail) {
      return NextResponse.json({ error: "No user email" }, { status: 400 });
    }

    // Decide credits based on plan
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
        credits = 0;
        break;
    }

    // Only update on subscription.created / payment.completed
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

    // Optional: create user record when free plan joined
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
