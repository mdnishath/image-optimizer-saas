import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image";
import { getUserFromRequest } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.credits <= 0) {
      return NextResponse.json({ error: "No credits left" }, { status: 403 });
    }

    const contentType = req.headers.get("content-type") || "";

    let inputBuffer: Buffer;
    let fileName: string;

    if (contentType.includes("application/json")) {
      // ✅ Big file (uploaded first)
      const { path, format = "webp", quality = 80 } = await req.json();

      const { data, error } = await supabase.storage
        .from("temp-uploads")
        .download(path);

      if (error || !data) throw new Error("Failed to fetch file from storage");

      inputBuffer = Buffer.from(await data.arrayBuffer());
      fileName = path.split("/").pop() || "upload";

      // Store options in headers for optimize
      req.headers.set("x-format", format);
      req.headers.set("x-quality", quality.toString());
    } else {
      // ✅ Small file (direct body)
      const arrayBuffer = await req.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
      fileName = "upload";
    }

    const sizeBefore = inputBuffer.length;

    const requestedFormat = (req.headers.get("x-format") || "webp") as
      | "webp"
      | "avif"
      | "jpeg"
      | "png";
    const quality = Number(req.headers.get("x-quality")) || 80;

    const outputBuffer = await optimizeImage(
      inputBuffer,
      requestedFormat,
      quality
    );
    const sizeAfter = outputBuffer.length;

    // ✅ Save optimized file to Supabase
    const optimizedPath = `optimized/${Date.now()}-${fileName}.${requestedFormat}`;
    await supabase.storage
      .from("temp-uploads")
      .upload(optimizedPath, outputBuffer, {
        contentType: `image/${requestedFormat}`,
        upsert: true,
      });

    // ✅ Deduct credits
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });

    // ✅ Get public URL
    const { data: pub } = supabase.storage
      .from("temp-uploads")
      .getPublicUrl(optimizedPath);

    return NextResponse.json({
      message: "Optimized successfully",
      sizeBefore,
      sizeAfter,
      downloadUrl: pub.publicUrl,
    });
  } catch (err) {
    console.error("❌ Optimize error", err);
    return NextResponse.json({ error: "Optimization failed" }, { status: 500 });
  }
}
