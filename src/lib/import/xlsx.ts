/**
 * ไฟล์ Excel ของการนำเข้าอาคารใหม่ — สร้าง template และอ่านไฟล์ที่กรอกแล้วกลับมา
 *
 * ทั้งสองทางใช้รายชื่อช่องจาก new-property.ts ชุดเดียวกัน
 * template ที่ดาวน์โหลดไปจึงอ่านกลับได้เสมอ ไม่มีวันที่หัวคอลัมน์สะกดไม่ตรงกับที่ตัวอ่านหา
 */

import ExcelJS from "exceljs";
import {
  PROPERTY_FIELDS,
  ROOM_COLUMNS,
  SHEET_PROPERTY,
  SHEET_ROOMS,
  type Cell,
  type ImportInput,
  type SheetRow,
} from "./new-property";

const SHEET_GUIDE = "วิธีกรอก";
const SHEET_EXAMPLE = "ตัวอย่าง";

/** แถวว่างที่เตรียมรูปแบบไว้ให้ — พอสำหรับอาคารขนาดกลาง เกินกว่านี้ก็พิมพ์ต่อได้ แค่ไม่มีรายการเลือก */
const PREPARED_ROWS = 200;

const GROUP_FILL: Record<string, string> = {
  room: "FFFDE7C7",
  tenant: "FFDCEBFA",
  meter: "FFDFF3E3",
};

const EXAMPLE_ROWS: Array<Partial<Record<(typeof ROOM_COLUMNS)[number]["key"], string | number>>> = [
  { roomNo: "101", type: "รายเดือน", baseRent: 3500, tenantName: "สมชาย ใจดี", nickname: "ชาย", phone: "0812345678", startDate: "1/6/2568", endDate: "31/5/2569", rent: 3500, deposit: 7000, ac: 500, elec: 1234, water: 56 },
  { roomNo: "102", type: "รายเดือน", baseRent: 3500, elec: 880, water: 31, note: "ห้องว่าง — เว้นช่องผู้เช่า" },
  { roomNo: "103", baseRent: 3800, tenantName: "สมหญิง รักดี", phone: "0898765432", startDate: "15/8/2568", rent: 3600, deposit: 7200, elec: 2010, water: 77 },
  { roomNo: "A1", floor: 1, type: "พาณิชย์", baseRent: 8000, tenantName: "ร้านกาแฟดีดี", startDate: "1/1/2568", rent: 8000, deposit: 16000, elec: 5320, water: 140 },
];

function styleHeader(row: ExcelJS.Row, fills: string[]) {
  row.height = 34;
  row.eachCell((cell, col) => {
    cell.font = { bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fills[col - 1] ?? "FFEEEEEE" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
  });
}

function addRoomSheet(wb: ExcelJS.Workbook, name: string, rows: typeof EXAMPLE_ROWS) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ws.columns = ROOM_COLUMNS.map((c) => ({
    header: c.required ? `${c.label} *` : c.label,
    key: c.key,
    width: c.width,
    // ตั้งเป็นข้อความก่อนพิมพ์ ไม่งั้นเบอร์โทร 08x ถูกตัด 0 ทิ้ง และห้อง 101/1 กลายเป็นวันที่
    style: c.text || c.date ? { numFmt: "@" } : {},
  }));
  // คำอธิบายคอลัมน์อยู่ในชีตวิธีกรอก ไม่ใส่เป็นโน้ตบนหัวคอลัมน์
  // exceljs อ่านโน้ตที่โปรแกรมอื่นบันทึกซ้ำไม่ได้ แล้วเปิดทั้งไฟล์ไม่ขึ้น
  styleHeader(ws.getRow(1), ROOM_COLUMNS.map((c) => GROUP_FILL[c.group]));

  for (const example of rows) ws.addRow(example);

  const typeCol = ROOM_COLUMNS.findIndex((c) => c.key === "type") + 1;
  const letter = ws.getColumn(typeCol).letter;
  for (let r = 2; r <= PREPARED_ROWS + 1; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"รายเดือน,พาณิชย์"'],
      showErrorMessage: true,
      errorTitle: "ประเภทห้อง",
      error: "เลือก รายเดือน หรือ พาณิชย์",
    };
  }
  return ws;
}

/** template เปล่าพร้อมตัวอย่างและวิธีกรอก */
export async function buildTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wilai Communities";

  /* --- วิธีกรอก --- */
  const guide = wb.addWorksheet(SHEET_GUIDE);
  guide.columns = [{ width: 4 }, { width: 96 }];
  const lines: Array<[string, string] | [string]> = [
    ["นำเข้าอาคารใหม่ — Wilai Communities"],
    ["1", `กรอกชีต "${SHEET_PROPERTY}" — ข้อมูลอาคารและค่าน้ำค่าไฟเริ่มต้น`],
    ["2", `กรอกชีต "${SHEET_ROOMS}" — หนึ่งแถวต่อหนึ่งห้อง ทั้งห้องที่มีคนอยู่และห้องว่าง`],
    ["", "ห้องว่าง: กรอกแค่ช่องสีส้ม (ห้อง) กับช่องสีเขียว (มิเตอร์) เว้นช่องสีฟ้า (ผู้เช่า) ทั้งหมด"],
    ["", "ช่องที่มี * ต้องกรอก ช่องอื่นเว้นได้ · คำอธิบายทุกคอลัมน์อยู่ในตารางด้านล่าง"],
    ["", "วันที่ใช้ วัน/เดือน/ปี พ.ศ. เช่น 1/6/2568 · เดือนใช้ เดือน/ปี เช่น 11/2569"],
    ["3", "มิเตอร์ล่าสุด = เลขบนหน้าปัดครั้งล่าสุดที่จดไว้ จะเป็นเลขครั้งก่อนของบิลแรกที่ออกในระบบ"],
    ["", "ใส่มิเตอร์ไฟกับน้ำให้ครบคู่ ไม่ทราบให้เว้นทั้งคู่ แล้วกรอกเลขครั้งก่อนเองตอนออกบิลแรก"],
    ["4", "ในแอป: ตั้งค่า → นำเข้าอาคารใหม่จาก Excel → เลือกไฟล์ → ตรวจผล → กดยืนยัน"],
    ["", "ระบบตรวจทุกแถวก่อน ถ้ามีจุดผิดจะบอกเลขแถว ยังไม่บันทึกอะไรจนกว่าจะกดยืนยัน"],
    ["", `ชีต "${SHEET_EXAMPLE}" มีไว้ดูเป็นแบบเท่านั้น ระบบไม่อ่านชีตนั้น`],
    ["!", "ไม่นำเข้าบิลเก่าและยอดค้าง — ยอดค้างจากระบบเดิมให้ใส่เป็นรายการอื่นในบิลแรกเอง"],
  ];
  lines.forEach((line, i) => {
    const row = guide.addRow(line.length === 1 ? ["", line[0]] : line);
    if (i === 0) row.getCell(2).font = { bold: true, size: 14 };
    else row.getCell(1).font = { bold: true, color: { argb: "FFDC8F2A" } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  guide.addRow([]);
  const tableHead = guide.addRow(["", `คอลัมน์ในชีต "${SHEET_ROOMS}"`]);
  tableHead.getCell(2).font = { bold: true, size: 12 };
  for (const c of ROOM_COLUMNS) {
    const row = guide.addRow(["", `${c.required ? `${c.label} *` : c.label}${c.hint ? ` — ${c.hint}` : ""}`]);
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL[c.group] } };
  }

  /* --- อาคาร --- */
  const prop = wb.addWorksheet(SHEET_PROPERTY);
  prop.columns = [
    { header: "รายการ", width: 34 },
    { header: "ค่า", width: 28, style: { numFmt: "@" } },
    { header: "คำอธิบาย", width: 62 },
  ];
  styleHeader(prop.getRow(1), ["FFEEEEEE", "FFFDE7C7", "FFEEEEEE"]);
  for (const f of PROPERTY_FIELDS) {
    const row = prop.addRow([f.required ? `${f.label} *` : f.label, f.example === "" ? null : f.example, f.hint]);
    row.getCell(1).font = { bold: Boolean(f.required) };
    row.getCell(3).font = { color: { argb: "FF6B7280" } };
    // ตัวเลขต้องเป็นตัวเลขจริง ไม่ใช่ข้อความที่หน้าตาเหมือนตัวเลข
    if (typeof f.example === "number") row.getCell(2).numFmt = "General";
  }

  /* --- ห้อง --- */
  addRoomSheet(wb, SHEET_ROOMS, []);
  addRoomSheet(wb, SHEET_EXAMPLE, EXAMPLE_ROWS);

  // เปิดไฟล์มาเจอชีตอาคารก่อน วิธีกรอกอยู่ข้างๆ ให้ดูได้
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/* --------------------------------- อ่านไฟล์ -------------------------------- */

export class WorkbookError extends Error {}

/** แกะค่าจริงออกจากช่อง — สูตรเอาผลลัพธ์ ตัวอักษรหลายสีเอาข้อความ ลิงก์เอาข้อความที่เห็น */
function plain(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("result" in value) return plain(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return plain(value.text as ExcelJS.CellValue);
    if ("error" in value) return null;
  }
  return null;
}

/** ป้ายชื่อเทียบกันโดยไม่สน * ช่องว่าง และตัวพิมพ์ — คนแก้หัวคอลัมน์นิดหน่อยก็ยังอ่านได้ */
function normalize(label: string): string {
  return label.replace(/\*/g, "").replace(/\s+/g, "").toLowerCase();
}

export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Omit<ImportInput, "existingTenantIds" | "today">> {
  const wb = new ExcelJS.Workbook();
  try {
    // ชนิดของ exceljs ยังเป็นของ Node รุ่นเก่า ตัวจริงรับ ArrayBuffer และ Uint8Array ได้
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new WorkbookError("เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx (บันทึกจาก Excel หรือ Google Sheets แบบ .xlsx)");
  }

  const propSheet = wb.getWorksheet(SHEET_PROPERTY);
  const roomSheet = wb.getWorksheet(SHEET_ROOMS);
  if (!propSheet || !roomSheet) {
    throw new WorkbookError(`ไม่พบชีต "${SHEET_PROPERTY}" หรือ "${SHEET_ROOMS}" — ใช้ template ที่ดาวน์โหลดจากหน้านี้ และอย่าเปลี่ยนชื่อชีต`);
  }

  /* --- อาคาร: ป้ายชื่อในคอลัมน์ A ค่าในคอลัมน์ B --- */
  const byLabel = new Map(PROPERTY_FIELDS.map((f) => [normalize(f.label), f.key]));
  const property: ImportInput["property"] = {};
  propSheet.eachRow((row) => {
    const key = byLabel.get(normalize(String(plain(row.getCell(1).value) ?? "")));
    if (key) property[key] = plain(row.getCell(2).value);
  });

  /* --- ห้อง: หาคอลัมน์จากหัวตาราง ไม่ยึดตำแหน่ง สลับคอลัมน์ได้ --- */
  const header = roomSheet.getRow(1);
  const columnOf = new Map<string, number>();
  header.eachCell((cell, col) => {
    const label = normalize(String(plain(cell.value) ?? ""));
    const column = ROOM_COLUMNS.find((c) => normalize(c.label) === label);
    if (column) columnOf.set(column.key, col);
  });
  const missing = ROOM_COLUMNS.filter((c) => c.required && !columnOf.has(c.key)).map((c) => c.label);
  if (missing.length > 0) {
    throw new WorkbookError(`ชีต "${SHEET_ROOMS}" ไม่มีคอลัมน์ ${missing.join(", ")} — อย่าลบหรือเปลี่ยนชื่อหัวตาราง`);
  }

  const rooms: SheetRow[] = [];
  roomSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: SheetRow["cells"] = {};
    for (const [key, col] of columnOf) cells[key as keyof SheetRow["cells"]] = plain(row.getCell(col).value);
    rooms.push({ row: rowNumber, cells });
  });

  return { property, rooms };
}
