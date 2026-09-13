import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/api";
import { verifyInvoiceToken } from "@/lib/invoice-link";
import { renderInvoice, type InvoiceFormat } from "@/lib/render-invoice";
import { getBill } from "@/lib/repo";

/** Chrome ไร้หน้าจอเปิดครั้งแรกใช้เวลาสองสามวินาที ค่าเริ่มต้น 10 วินาทีไม่พอ */
export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<InvoiceFormat, string> = {
  png: "image/png",
  pdf: "application/pdf",
};

/**
 * ดาวน์โหลดใบแจ้งหนี้เป็นรูปหรือ PDF
 *
 * ใช้โทเคนตัวเดียวกับหน้าพิมพ์ ไม่ต้องล็อกอิน เพราะต่อไปตัวส่งเข้าไลน์
 * จะต้องเรียกเส้นนี้ด้วย และเลขบิลเป็นเลขรันที่ไล่เดาได้ถ้าไม่มีโทเคนกั้น
 */
export async function GET(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const id = decodeURIComponent(billId);
  const url = new URL(request.url);

  // ตอบ 404 เหมือนกันทั้งกรณีโทเคนผิดและไม่มีบิล จะได้ไม่บอกว่าเลขไหนมีอยู่จริง
  if (!verifyInvoiceToken(id, url.searchParams.get("t") ?? undefined)) {
    return new NextResponse("ไม่พบใบแจ้งหนี้", { status: 404 });
  }

  const format: InvoiceFormat = url.searchParams.get("format") === "png" ? "png" : "pdf";
  const bill = await getBill(id);
  if (!bill || bill.status === "void") return new NextResponse("ไม่พบใบแจ้งหนี้", { status: 404 });

  try {
    const file = await renderInvoice(id, format, requestOrigin(request));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": TYPES[format],
        "Content-Disposition": `attachment; filename="${bill.invoiceNo}.${format}"`,
        "Content-Length": String(file.byteLength),
        // บิลแก้ได้ทีหลัง จึงไม่ให้แคช ไม่งั้นแก้แล้วยังโหลดใบเก่ามาได้
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("render invoice failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `สร้างไฟล์ใบแจ้งหนี้ไม่สำเร็จ: ${detail}` },
      { status: 500 },
    );
  }
}
