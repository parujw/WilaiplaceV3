/** ย่อรูปในเบราว์เซอร์ก่อนส่งขึ้นเซิร์ฟเวอร์ — รูปจากกล้องมือถือใหญ่เกินกว่าจะส่งดิบๆ */
export async function downscaleImage(file: File, maxEdge = 640, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
