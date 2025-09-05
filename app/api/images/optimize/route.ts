import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image";
import { getUserFromRequest } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.credits <= 0) {
      return NextResponse.json(
        { error: "Invalid API key or no credits left" },
        { status: 403 }
      );
    }

    let inputBuffer: Buffer;
    let originalPath: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // Big file flow → download from Supabase
      const { path } = await req.json();
      if (!path) {
        return NextResponse.json(
          { error: "No file path provided" },
          { status: 400 }
        );
      }
      originalPath = path;

      const { data: fileData, error: dlError } = await supabase.storage
        .from("temp-uploads")
        .download(path);

      if (dlError || !fileData) {
        console.error("❌ Download error:", dlError);
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      inputBuffer = Buffer.from(await fileData.arrayBuffer());
    } else {
      // Small file flow → direct binary
      const arrayBuffer = await req.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
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
    const outputBuffer = await optimizeImage(
      inputBuffer,
      requestedFormat,
      quality
    );
    const sizeAfter = outputBuffer.length;

    let downloadUrl: string | null = null;

    if (sizeBefore >= 4 * 1024 * 1024 || originalPath) {
      // Upload optimized version to Supabase
      const optimizedPath = `optimized/${Date.now()}.${requestedFormat}`;
      const { error: upError } = await supabase.storage
        .from("temp-uploads")
        .upload(optimizedPath, outputBuffer, {
          contentType: `image/${requestedFormat}`,
          upsert: true,
        });

      if (upError) {
        console.error("❌ Upload error:", upError);
        return NextResponse.json(
          { error: "Failed to upload optimized image" },
          { status: 500 }
        );
      }

      // Delete original file if provided
      if (originalPath) {
        await supabase.storage.from("temp-uploads").remove([originalPath]);
      }

      const { data: pub } = supabase.storage
        .from("temp-uploads")
        .getPublicUrl(optimizedPath);
      downloadUrl = pub.publicUrl;
    }

    // 💳 Deduct credits
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });

    return NextResponse.json({
      message: "Image optimized successfully",
      sizeBefore,
      sizeAfter,
      savedPercent: (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(1),
      format: requestedFormat,
      ...(downloadUrl
        ? { downloadUrl } // Big files
        : {
            file: `data:image/${requestedFormat};base64,${outputBuffer.toString(
              "base64"
            )}`,
          }), // Small files
    });
  } catch (err) {
    console.error("❌ Optimize API error:", err);
    return NextResponse.json(
      { error: "Image optimization failed" },
      { status: 500 }
    );
  }
}
