import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("✅ Freemius SUCCESS payload:", body);

    const { user, plan_id, license } = body;

    if (!user?.email) {
      return NextResponse.json({ error: "No user email" }, { status: 400 });
    }

    const planId = plan_id;
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

      console.log("✅ User credits updated:", updated);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Freemius success error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
