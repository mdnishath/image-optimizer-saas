import sharp from "sharp";

export async function optimizeImage(
  input: Buffer,
  format: "webp" | "avif" | "jpeg" | "png" = "webp",
  quality = 80
) {
  return sharp(input)
    .resize({ width: 1920, withoutEnlargement: true })
    .toFormat(format, { quality })
    .toBuffer();
}
