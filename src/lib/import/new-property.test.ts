import { describe, expect, it } from "vitest";
import {
  billingMonthOptions,
  cellCycle,
  cellDate,
  cellNumber,
  cellPhone,
  floorFromRoomNo,
  planImport,
  type ImportInput,
  type SheetRow,
} from "./new-property";

const property: ImportInput["property"] = {
  id: "wlp2",
  name: "วิไลเพลส 2",
  elec: 8,
  water: 20,
  ac: 500,
  firstCycle: "11/2569",
};

function input(rooms: SheetRow["cells"][], overrides: Partial<ImportInput> = {}): ImportInput {
  return {
    property,
    rooms: rooms.map((cells, i) => ({ row: i + 2, cells })),
    existingTenantIds: ["T0001", "T0002", "T0017"],
    today: "2026-10-29",
    ...overrides,
  };
}

describe("ค่าในช่อง", () => {
  it("ตัวเลขรับลูกน้ำและคำว่าบาท", () => {
    expect(cellNumber("3,500")).toBe(3500);
    expect(cellNumber("3500 บาท")).toBe(3500);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber("สามพัน")).toBeNaN();
  });

  it("เบอร์โทรที่ Excel ตัด 0 หน้าทิ้ง เติมกลับให้", () => {
    expect(cellPhone(812345678)).toBe("0812345678");
    expect(cellPhone("0812345678")).toBe("0812345678");
    expect(cellPhone("02-123-4567")).toBe("02-123-4567");
  });

  it("วันที่แบบไทย ปี พ.ศ. และวันที่ของ Excel", () => {
    expect(cellDate("1/6/2568")).toBe("2025-06-01");
    expect(cellDate("2025-06-01")).toBe("2025-06-01");
    expect(cellDate(new Date(Date.UTC(2025, 5, 1)))).toBe("2025-06-01");
    // Excel ไม่รู้จัก พ.ศ. ช่องวันที่ที่พิมพ์ 2568 ลงไปได้ปี 2568 ตรงๆ
    expect(cellDate(new Date(Date.UTC(2568, 5, 1)))).toBe("2025-06-01");
    expect(cellDate("")).toBeUndefined();
    expect(cellDate("31/2/2568")).toBeNull();
    expect(cellDate("พรุ่งนี้")).toBeNull();
  });

  it("เดือนรับหลายรูปแบบ", () => {
    expect(cellCycle("11/2569")).toBe("202611");
    expect(cellCycle("11/2026")).toBe("202611");
    expect(cellCycle("2026-11")).toBe("202611");
    expect(cellCycle(new Date(Date.UTC(2026, 10, 1)))).toBe("202611");
    expect(cellCycle("13/2569")).toBeNull();
  });

  it("เดาชั้นจากเลขห้อง", () => {
    expect(floorFromRoomNo("305")).toBe(3);
    expect(floorFromRoomNo("1201")).toBe(12);
    expect(floorFromRoomNo("A1")).toBeNull();
  });
});

describe("billingMonthOptions", () => {
  it("ย้อนหลังหนึ่งเดือนถึงล่วงหน้าหนึ่งปี เป็นเดือน/ปี พ.ศ. ที่ตัวอ่านอ่านกลับได้", () => {
    const options = billingMonthOptions(new Date(Date.UTC(2026, 0, 15)));
    expect(options[0]).toBe("12/2568");
    expect(options[1]).toBe("1/2569");
    expect(options.at(-1)).toBe("1/2570");
    expect(options.map((o) => cellCycle(o))).not.toContain(null);
  });
});

describe("planImport", () => {
  it("ห้องมีคนอยู่ได้ผู้เช่า สัญญา และเลขมิเตอร์ ห้องว่างได้แค่ห้อง", () => {
    const { plan, errors } = planImport(
      input([
        { roomNo: "101", baseRent: 3500, tenantName: "สมชาย", phone: 812345678, startDate: "1/6/2568", deposit: 7000, elec: 1234, water: 56 },
        { roomNo: "102", baseRent: 3500, elec: 880, water: 31 },
      ]),
    );
    expect(errors).toEqual([]);
    expect(plan!.rooms).toHaveLength(2);
    expect(plan!.tenants).toHaveLength(1);

    const [room101, room102] = plan!.rooms;
    expect(room101).toMatchObject({ id: "wlp2-101", floor: 1, activeLeaseId: "L-T0018" });
    expect(room102.activeLeaseId).toBeNull();

    expect(plan!.leases[0]).toMatchObject({
      roomId: "wlp2-101",
      tenantId: "T0018",
      rent: 3500,
      deposit: 7000,
      startDate: "2025-06-01",
      rates: { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 },
    });
    expect(plan!.tenants[0].phone).toBe("0812345678");
  });

  it("รหัสผู้เช่าต่อจากของทุกอาคาร ไม่เริ่ม T0001 ใหม่แล้วทับของอาคารแรก", () => {
    const { plan } = planImport(
      input([
        { roomNo: "101", baseRent: 3500, tenantName: "ก" },
        { roomNo: "102", baseRent: 3500, tenantName: "ข" },
      ]),
    );
    expect(plan!.tenants.map((t) => t.id)).toEqual(["T0018", "T0019"]);
  });

  it("เลขมิเตอร์ที่ยกมาเป็นของรอบก่อนบิลแรก ครั้งก่อนเท่ากับครั้งนี้ ไม่มีหน่วยที่ใช้", () => {
    const { plan } = planImport(input([{ roomNo: "101", baseRent: 3500, elec: 1234, water: 56 }]));
    expect(plan!.meterReadings[0]).toMatchObject({
      id: "MR-wlp2-202610-101",
      cycle: "202610",
      elecPrevious: 1234,
      elecCurrent: 1234,
      waterPrevious: 56,
      waterCurrent: 56,
    });
  });

  it("ค่าแอร์ของห้องแทนค่าของอาคารได้ ใส่ 0 คือไม่มี ไม่ใช่ใช้ค่าอาคาร", () => {
    const { plan } = planImport(input([{ roomNo: "101", baseRent: 3500, tenantName: "ก", ac: 0 }]));
    expect(plan!.leases[0].rates.ac).toBe(0);
  });

  it("ไม่ใส่ราคาป้ายแต่มีค่าเช่าจริง ใช้ค่าเช่าเป็นราคาป้าย", () => {
    const { plan, errors } = planImport(input([{ roomNo: "101", tenantName: "ก", rent: 4000 }]));
    expect(errors).toEqual([]);
    expect(plan!.rooms[0].baseRent).toBe(4000);
  });

  it("แถวว่างข้ามไป ไม่นับเป็นห้อง", () => {
    const { plan } = planImport(input([{ roomNo: "101", baseRent: 3500 }, {}, { roomNo: "", note: null }]));
    expect(plan!.rooms).toHaveLength(1);
  });

  it("บอกเลขแถวของทุกจุดที่ผิด และไม่สร้างอะไรเลย", () => {
    const { plan, errors } = planImport(
      input([
        { roomNo: "101", baseRent: 3500 },
        { roomNo: "101", baseRent: 3500 },
        { roomNo: "A1", baseRent: 3500 },
        { roomNo: "103", baseRent: 3500, phone: "0812345678" },
        { roomNo: "104", baseRent: 3500, elec: 100 },
        { roomNo: "105", baseRent: "สามพัน" },
        { roomNo: "106", baseRent: 3500, tenantName: "ก", startDate: "1/6/2569", endDate: "1/6/2568" },
        { roomNo: "107", baseRent: 3500, type: "รายวัน" },
        { roomNo: "108", baseRent: 3500, condition: "ห้องพร้อม" },
        { roomNo: "109", baseRent: 3500, floor: 1.5 },
      ]),
    );
    expect(plan).toBeNull();
    expect(errors.map((e) => [e.row, e.message.slice(0, 20)])).toEqual([
      [3, "เลขห้อง 101 ซ้ำกับแถว 2".slice(0, 20)],
      [4, "เดาชั้นจากเลขห้อง A1 ไม่ได้ ใส่ช่องชั้นด้วย".slice(0, 20)],
      [5, "มีข้อมูลผู้เช่าแต่ไม่มีชื่อผู้เช่า — ห้องว่าง".slice(0, 20)],
      [6, "ใส่มิเตอร์ไฟกับมิเตอร์น้ำให้ครบทั้งคู่".slice(0, 20)],
      [7, 'ราคาป้าย ต้องเป็นตัวเลขไม่ติดลบ'.slice(0, 20)],
      [8, "วันสิ้นสุดสัญญามาก่อนวันเริ่มสัญญา".slice(0, 20)],
      [9, "ประเภทห้องต้องเลือกจากรายการ".slice(0, 20)],
      [10, "สภาพห้องต้องเลือกจากรายการ".slice(0, 20)],
      [11, "ชั้นต้องเป็นจำนวนเต็ม".slice(0, 20)],
    ]);
  });

  it("ข้อมูลอาคารผิด บอกทั้งหมดในครั้งเดียว", () => {
    const { plan, errors } = planImport(
      input([{ roomNo: "101", baseRent: 3500 }], {
        property: { id: "WLP 2!", name: "", elec: null, water: 20, dueDay: 31, firstCycle: null },
      }),
    );
    expect(plan).toBeNull();
    expect(errors.map((e) => e.message.slice(0, 12))).toEqual([
      'รหัสอาคาร "wlp 2!"'.slice(0, 12),
      "ต้องใส่ชื่ออาคาร".slice(0, 12),
      "ต้องใส่ค่าไฟ".slice(0, 12),
      "ชำระภายในวันที่ ต้องเป็น".slice(0, 12),
      "ต้องใส่เดือนที่เริ่มออกบิล".slice(0, 12),
    ]);
  });

  it("ไม่มีห้องเลย นำเข้าไม่ได้", () => {
    const { plan, errors } = planImport(input([]));
    expect(plan).toBeNull();
    expect(errors[0].message).toBe("ยังไม่มีห้องเลย");
  });

  it("เตือนห้องที่มีคนอยู่แต่ไม่มีเลขมิเตอร์หรือวันเริ่มสัญญา แต่ยังนำเข้าได้", () => {
    const { plan, warnings } = planImport(input([{ roomNo: "101", baseRent: 3500, tenantName: "ก" }]));
    expect(plan).not.toBeNull();
    expect(warnings).toHaveLength(2);
  });

  it("สภาพห้องรับคำเดียวกับที่ขึ้นในแอป ไม่ใส่ = พร้อมใช้", () => {
    const { plan } = planImport(
      input([
        { roomNo: "101", baseRent: 3500, condition: "กำลังซ่อม" },
        { roomNo: "102", baseRent: 3500 },
      ]),
    );
    expect(plan!.rooms.map((r) => r.condition)).toEqual(["repair", "ready"]);
  });

  it("จำนวนชั้นของอาคารมาจากห้องชั้นสูงสุด", () => {
    const { plan } = planImport(
      input([
        { roomNo: "101", baseRent: 3500 },
        { roomNo: "502", baseRent: 3500 },
      ]),
    );
    expect(plan!.property.floors).toBe(5);
  });
});
