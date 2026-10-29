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

describe("dropdown ในช่องที่ต้องเหมือนกันทุกอาคาร", () => {
  it("ประเภท สภาพห้อง วันครบกำหนด และเดือนเริ่มออกบิล เป็นรายการให้เลือก ตัวเลขห้ามติดลบ", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTemplate(new Date(Date.UTC(2026, 9, 29)))) as unknown as ExcelJS.Buffer);

    const rooms = wb.getWorksheet(SHEET_ROOMS)!;
    const cellOf = (key: string, row: number) => rooms.getRow(row).getCell(ROOM_COLUMNS.findIndex((c) => c.key === key) + 1);
    expect(cellOf("type", 2).dataValidation).toMatchObject({ type: "list", formulae: ['"รายเดือน,พาณิชย์"'] });
    expect(cellOf("condition", 201).dataValidation).toMatchObject({
      type: "list",
      formulae: ['"พร้อมใช้,กำลังทำความสะอาด,กำลังซ่อม"'],
    });
    expect(cellOf("baseRent", 50).dataValidation).toMatchObject({ type: "decimal", operator: "greaterThanOrEqual" });
    expect(cellOf("floor", 2).dataValidation).toMatchObject({ type: "whole" });
    expect(cellOf("tenantName", 2).dataValidation).toBeUndefined();

    const prop = wb.getWorksheet(SHEET_PROPERTY)!;
    const valueOf = (label: string) => {
      let found: ExcelJS.Cell | undefined;
      prop.eachRow((row) => {
        if (String(row.getCell(1).value).startsWith(label)) found = row.getCell(2);
      });
      return found!;
    };
    expect(valueOf("ชำระภายในวันที่").dataValidation.formulae[0]).toMatch(/^"1,2,.*,28"$/);
    expect(valueOf("เริ่มออกบิล").dataValidation.formulae[0]).toMatch(/^"9\/2569,10\/2569,11\/2569,/);
    expect(valueOf("ค่าไฟ").dataValidation).toMatchObject({ type: "decimal" });
  });
});

describe("ช่วงของการตรวจในช่อง", () => {
  it("ไม่ซ้อนกัน — ช่วงซ้อนทำให้ Excel ขึ้นว่าไฟล์เสียแล้วขอซ่อม", async () => {
    // อ่าน XML ดิบ เพราะ exceljs อ่านกลับมาแล้วแตกช่วงเป็นทีละช่อง มองไม่เห็นว่าซ้อน
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await buildTemplate());
    const files = Object.keys(zip.files).filter((f) => /worksheets\/sheet\d+\.xml$/.test(f));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const xml = await zip.file(file)!.async("string");
      const ranges = [...xml.matchAll(/sqref="([A-Z]+)(\d+)(?::[A-Z]+(\d+))?"/g)].map((m) => ({
        col: m[1],
        from: Number(m[2]),
        to: Number(m[3] ?? m[2]),
      }));
      for (const a of ranges) {
        const overlapping = ranges.filter((b) => b !== a && b.col === a.col && b.from <= a.to && a.from <= b.to);
        expect(overlapping, `${file} ${a.col}${a.from}:${a.to}`).toEqual([]);
      }
    }
  });
});
