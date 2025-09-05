import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image";
import { getUserFromRequest } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // must have upload+delete perms
);

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "50mb", // safeguard, Supabase handles larger
  },
};

// helper: upload buffer to Supabase temp bucket
async function uploadToSupabase(buffer: Buffer, filename: string) {
  const bucket = "temp-uploads"; // create this bucket in Supabase
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(filename);

  return { bucket, key: filename, publicUrl };
}

export async function POST(req: Request) {
  try {
    // 🔑 Authenticate
    const user = await getUserFromRequest(req);
    if (!user || user.credits <= 0) {
      return NextResponse.json(
        { error: "Invalid API key or no credits left" },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let inputBuffer: Buffer | null = null;
    let cleanupBucket: string | null = null;
    let cleanupKey: string | null = null;

    if (contentType.includes("application/json")) {
      // Case 1: plugin/dashboard sent { fileUrl }
      const { fileUrl } = await req.json();
      if (!fileUrl) {
        return NextResponse.json({ error: "Missing fileUrl" }, { status: 400 });
      }
      const res = await fetch(fileUrl);
      inputBuffer = Buffer.from(await res.arrayBuffer());

      // cleanup
      const parts = new URL(fileUrl).pathname.split("/");
      cleanupBucket = parts[2]; // bucket
      cleanupKey = parts.slice(3).join("/"); // path
    } else if (contentType.includes("multipart/form-data")) {
      // Case 2: WP plugin form upload
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      inputBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      // Case 3: Dashboard raw binary
      const arrayBuffer = await req.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    }

    if (!inputBuffer || inputBuffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // 🚦 Check size and offload big files to Supabase
    if (inputBuffer.length > 4 * 1024 * 1024 && !cleanupBucket) {
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
      const { bucket, key, publicUrl } = await uploadToSupabase(
        inputBuffer,
        filename
      );
      const res = await fetch(publicUrl);
      inputBuffer = Buffer.from(await res.arrayBuffer());
      cleanupBucket = bucket;
      cleanupKey = key;
    }

    const sizeBefore = inputBuffer.length;

    // ⚙️ Options
    const requestedFormat = (req.headers.get("x-format") || "webp") as
      | "webp"
      | "avif"
      | "jpeg"
      | "png";
    const quality = Number(req.headers.get("x-quality")) || 80;

    // 🚀 Optimize
    const outputBuffer = await optimizeImage(inputBuffer, requestedFormat, quality);
    const sizeAfter = outputBuffer.length;

    // 💳 Deduct credits
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });

    // 🧹 Cleanup temp file from Supabase
    if (cleanupBucket && cleanupKey) {
      await supabase.storage.from(cleanupBucket).remove([cleanupKey]);
      console.log(`🗑️ Deleted temp file from Supabase: ${cleanupBucket}/${cleanupKey}`);
    }

    // 🔀 Detect client
    const usedApiKey = req.headers.get("x-api-key");
    if (usedApiKey) {
      // WP plugin → return binary
      return new Response(new Uint8Array(outputBuffer), {
        headers: {
          "Content-Type": `image/${requestedFormat}`,
          "Content-Disposition": `attachment; filename="optimized.${requestedFormat}"`,
        },
      });
    } else {
      // Dashboard → return base64 JSON
      const base64 = Buffer.from(outputBuffer).toString("base64");
      return NextResponse.json({
        message: "Image optimized successfully",
        sizeBefore,
        sizeAfter,
        savedPercent: (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(1),
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
