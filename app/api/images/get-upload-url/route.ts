import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ✅ safe on server
);

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();

    const filePath = `raw/${Date.now()}-${filename}`;

    const { data, error } = await supabase.storage
      .from("temp-uploads")
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error("❌ Signed URL error:", error);
      return NextResponse.json(
        { error: "Failed to create signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ path: filePath, uploadUrl: data.signedUrl });
  } catch (err) {
    console.error("❌ get-upload-url error:", err);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
