import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

const planCredits: Record<string, number> = {
  "34244": 100, // Free
  "34240": 5000, // Optimizer 5K
  "34242": 20000, // Optimizer 20K
  "34243": 1000000, // Optimizer 1M
};

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
    const signature = req.headers.get("x-freemius-signature");

    if (!verifySignature(rawBody, signature)) {
      console.error("❌ Invalid Freemius signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const event = body.event?.toLowerCase().replace(".", "_") ?? "unknown";
    const userEmail = body.user?.email;
    const planId = body.plan_id || body.plan?.id;
    const licenseKey = body.license?.key;

    console.log(
      "📩 Freemius event:",
      event,
      "plan:",
      planId,
      "email:",
      userEmail
    );

    if (!userEmail) {
      return NextResponse.json({ error: "No user email" }, { status: 400 });
    }

    const credits = planCredits[planId ?? ""] ?? 0;

    if (event === "subscription_created" || event === "payment_completed") {
      if (credits > 0) {
        await prisma.user.upsert({
          where: { email: userEmail },
          update: {
            credits: { increment: credits },
            apiKey: licenseKey ?? undefined,
          },
          create: {
            email: userEmail,
            credits,
            apiKey: licenseKey ?? null,
          },
        });
        console.log(`✅ Added ${credits} credits to ${userEmail}`);
      }
    }

    if (event === "license_activated" && licenseKey) {
      await prisma.user.upsert({
        where: { email: userEmail },
        update: { apiKey: licenseKey },
        create: { email: userEmail, apiKey: licenseKey, credits: 0 },
      });
      console.log(`🔑 License key saved for ${userEmail}`);
    }

    // Optional: log all webhook events
    await (prisma as any).webhookEvent.create({
      data: { event, payload: body },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
