import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { optimizeImage } from "@/lib/image";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    // 🔑 Identify user (via session OR Freemius license key)
    const user = await getUserFromRequest(req);

    if (!user || user.credits <= 0) {
      return NextResponse.json(
        { error: "Invalid API key or no credits left" },
        { status: 403 }
      );
    }

    // 📥 File
    const arrayBuffer = await req.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    const sizeBefore = inputBuffer.length;

    // ⚙️ Options
    const requestedFormat = (req.headers.get("x-format") || "webp") as
      | "webp"
      | "avif"
      | "jpeg"
      | "png";
    const quality = Number(req.headers.get("x-quality")) || 80;

    // 🚀 Optimize
    const outputBuffer = await optimizeImage(
      inputBuffer,
      requestedFormat,
      quality
    );
    const sizeAfter = outputBuffer.length;

    // 💳 Deduct credits
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });

    // 🔀 Detect WP plugin vs Dashboard
    const usedApiKey = req.headers.get("x-api-key");

    if (usedApiKey) {
      // 👉 WordPress plugin client: return binary file
      return new Response(new Uint8Array(outputBuffer), {
        headers: {
          "Content-Type": `image/${requestedFormat}`,
          "Content-Disposition": `attachment; filename="optimized.${requestedFormat}"`,
        },
      });
    } else {
      // 👉 Dashboard client: return JSON + base64
      const base64 = Buffer.from(outputBuffer).toString("base64");

      return NextResponse.json({
        message: "Image optimized successfully",
        sizeBefore,
        sizeAfter,
        savedPercent: (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(
          1
        ),
        file: `data:image/${requestedFormat};base64,${base64}`,
        format: requestedFormat,
      });
    }
  } catch (error) {
    console.error("❌ Optimization error:", error);
    return NextResponse.json(
      { error: "Image optimization failed" },
      { status: 500 }
    );
  }
}
