import { BinaryBitmap, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";
import sharp from "sharp";

/** Decodes a QR code from an image buffer, mirroring what a phone camera reads. */
export async function decodeQrText(
  imageBuffer: Buffer,
  crop?: { left: number; top: number; width: number; height: number },
): Promise<string | null> {
  let pipeline = sharp(imageBuffer);
  if (crop) pipeline = pipeline.extract({ ...crop });

  const { data, info } = await pipeline.greyscale().raw().toBuffer({ resolveWithObject: true });

  const reader = new MultiFormatReader();
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)),
  );

  try {
    return reader.decode(bitmap).getText();
  } catch {
    return null;
  }
}
