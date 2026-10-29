import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { planImport, ROOM_COLUMNS, SHEET_PROPERTY, SHEET_ROOMS, type SheetRow } from "./new-property";
import { buildTemplate, readWorkbook, WorkbookError } from "./xlsx";

/** กรอก template จริงเหมือนที่คนกรอก แล้วอ่านกลับ — template กับตัวอ่านต้องเข้ากันเสมอ */
async function filledTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate()) as unknown as ExcelJS.Buffer);

  const prop = wb.getWorksheet(SHEET_PROPERTY)!;
  prop.eachRow((row) => {
    const label = String(row.getCell(1).value);
    if (label.startsWith("รหัสอาคาร")) row.getCell(2).value = "wlp2";
    if (label.startsWith("ชื่ออาคาร")) row.getCell(2).value = "วิไลเพลส 2";
    if (label.startsWith("เริ่มออกบิล")) row.getCell(2).value = "11/2569";
  });

  // กรอกตามตำแหน่งคอลัมน์ในแถว 2, 3 เหมือนคนพิมพ์ลงไป
  const rooms = wb.getWorksheet(SHEET_ROOMS)!;
  const fill = (rowNo: number, cells: Partial<Record<keyof SheetRow["cells"], ExcelJS.CellValue>>) => {
    for (const [key, value] of Object.entries(cells)) {
      rooms.getRow(rowNo).getCell(ROOM_COLUMNS.findIndex((c) => c.key === key) + 1).value = value;
    }
  };
  fill(2, { roomNo: "201", baseRent: 3500, tenantName: "สมชาย", phone: 812345678, startDate: "1/6/2568", elec: 1234, water: 56 });
  fill(3, { roomNo: "202", baseRent: { formula: "3000+500", result: 3500 } });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("template Excel", () => {
  it("กรอก template แล้วอ่านกลับได้ครบ", async () => {
    const sheets = await readWorkbook(await filledTemplate());
    const { plan, errors } = planImport({ ...sheets, existingTenantIds: [], today: "2026-10-29" });

    expect(errors).toEqual([]);
    expect(plan!.property).toMatchObject({ id: "wlp2", name: "วิไลเพลส 2", defaultRates: { elec: 8, water: 20 } });
    expect(plan!.rooms.map((r) => [r.roomNo, r.floor, r.baseRent])).toEqual([
      ["201", 2, 3500],
      ["202", 2, 3500],
    ]);
    expect(plan!.tenants[0]).toMatchObject({ name: "สมชาย", phone: "0812345678" });
    expect(plan!.meterReadings[0]).toMatchObject({ cycle: "202610", elecCurrent: 1234 });
  });

  it("template เปล่ายังไม่มีห้อง นำเข้าไม่ได้", async () => {
    const sheets = await readWorkbook(await buildTemplate());
    const { plan, errors } = planImport({ ...sheets, existingTenantIds: [], today: "2026-10-29" });
    expect(plan).toBeNull();
    expect(errors.some((e) => e.message === "ยังไม่มีห้องเลย")).toBe(true);
  });

  it("ไฟล์ที่ไม่ใช่ Excel บอกให้ใช้ .xlsx", async () => {
    await expect(readWorkbook(new TextEncoder().encode("hello").buffer as ArrayBuffer)).rejects.toBeInstanceOf(WorkbookError);
  });

  it("ไฟล์ Excel อื่นที่ไม่ใช่ template บอกว่าหาชีตไม่เจอ", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1");
    await expect(readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/ไม่พบชีต/);
  });
});

describe("template ไม่มีโน้ตบนช่อง", () => {
  it("ไม่มีไฟล์โน้ตในไฟล์ — exceljs อ่านโน้ตที่โปรแกรมอื่นบันทึกซ้ำไม่ได้", async () => {
    const zip = new TextDecoder("latin1").decode(await buildTemplate());
    expect(zip).not.toMatch(/comments\d*\.xml/);
  });
});
