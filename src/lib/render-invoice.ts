import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { env } from "./env";
import { invoicePrintPath } from "./invoice-link";

/**
 * วาดใบแจ้งหนี้ที่เซิร์ฟเวอร์ ออกมาเป็นรูปหรือ PDF
 *
 * ใช้ Chrome ไร้หน้าจอเปิดหน้า /invoice/[id]/print ตัวเดิมที่คุณกดพิมพ์อยู่
 * ไม่ได้เขียน layout ขึ้นใหม่ เพราะใบแจ้งหนี้เป็นเอกสารการเงิน
 * ใบที่ส่งให้ผู้เช่ากับใบที่เจ้าของพิมพ์ต้องเป็นใบเดียวกันเป๊ะเสมอ
 * ถ้าแยกเป็นสองชุด วันหนึ่งแก้ชุดเดียวลืมอีกชุด แล้วยอดสองใบไม่ตรงกัน
 *
 * แลกกับการที่ต้องแบก Chrome ไปด้วย และครั้งแรกที่เรียกจะช้าสองสามวินาที
 * งานนี้เดือนละครั้ง จึงคุ้มกว่าความเสี่ยงที่เอกสารจะไม่ตรงกัน
 */

/** A4 กว้าง 210 มม. = 794 px ที่ 96 dpi — ตรงกับความกว้างแผ่นใน print.css */
const SHEET_WIDTH_PX = 794;

/** คูณสองให้รูปคมพอที่ผู้เช่าจะซูมอ่านเลขมิเตอร์ได้ และ QR ยังสแกนติด */
const SCALE = 2;

/**
 * เซิร์ฟเวอร์จะเปิดหน้าเว็บของตัวเอง จึงต้องรู้ที่อยู่เต็มของตัวเอง
 * บน Vercel ใช้ VERCEL_URL ซึ่งชี้มาที่ deployment ปัจจุบันเสมอ
 * ไม่ใช้ที่อยู่ production เพราะจะกลายเป็นวาดจากโค้ดเวอร์ชันอื่น
 */
function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL") ?? env("SITE_URL");
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = env("VERCEL_URL");
  if (vercel) return `https://${vercel}`;

  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

/** บน serverless ใช้ Chrome ที่ติดมากับแพ็กเกจ บนเครื่องตัวเองใช้ที่ลงไว้แล้ว */
async function launch(): Promise<Browser> {
  const serverless = Boolean(env("AWS_LAMBDA_FUNCTION_NAME") ?? env("VERCEL"));

  if (serverless) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const local =
    env("CHROME_PATH") ??
    env("PUPPETEER_EXECUTABLE_PATH") ??
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

  return puppeteer.launch({
    executablePath: local,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
}

export type InvoiceFormat = "png" | "pdf";

export async function renderInvoice(billId: string, format: InvoiceFormat): Promise<Buffer> {
  const browser = await launch();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SHEET_WIDTH_PX, height: 1200, deviceScaleFactor: SCALE });
    await page.goto(`${siteUrl()}${invoicePrintPath(billId)}`, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });

    // ฟอนต์ไทยกับรูป QR ต้องมาครบก่อน ไม่งั้นได้รูปที่ตัวอักษรยังไม่เปลี่ยนฟอนต์
    await page.evaluate(() => document.fonts.ready);

    if (format === "pdf") {
      // ขอบกระดาษมาจาก @page ใน print.css อยู่แล้ว ไม่ต้องสั่งซ้ำที่นี่
      const pdf = await page.pdf({ format: "a4", printBackground: true });
      return Buffer.from(pdf);
    }

    // ถ่ายเฉพาะตัวแผ่น ไม่เอาพื้นหลังสีเทาของหน้าจอตัวอย่างติดมาด้วย
    await page.addStyleTag({ content: ".print-bar { display: none !important; }" });
    const sheet = await page.$(".sheet");
    if (!sheet) throw new Error("ไม่พบใบแจ้งหนี้ในหน้าที่เปิดขึ้นมา");

    return Buffer.from(await sheet.screenshot({ type: "png" }));
  } finally {
    await browser.close();
  }
}
