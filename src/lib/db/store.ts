/**
 * สัญญาการเข้าถึงข้อมูล — มีสองตัวทำจริง
 *   firestore.ts  ใช้เมื่อตั้งค่า Firebase แล้ว (ของจริง)
 *   local.ts      ใช้เมื่อยังไม่ตั้งค่า อ่านข้อมูล V2 ที่ย้ายมาแล้วจากไฟล์ (โหมดสาธิต)
 *
 * โค้ดหน้าจอเรียกผ่าน repo.ts เท่านั้น ไม่เรียก store ตรงๆ
 */

export type CollectionName =
  | "properties"
  | "rooms"
  | "tenants"
  | "leases"
  | "meterReadings"
  | "bills"
  | "payments"
  | "expenses"
  | "maintenance"
  | "utilityCosts"
  | "auditLogs"
  | "allowlist"
  | "counters";

export interface WhereClause {
  field: string;
  op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";
  value: unknown;
}

export interface ListOptions {
  where?: WhereClause[];
  orderBy?: { field: string; dir?: "asc" | "desc" };
  limit?: number;
}

export interface WriteOp {
  type: "set" | "update" | "delete";
  collection: CollectionName;
  id: string;
  data?: Record<string, unknown>;
}

export interface Store {
  readonly mode: "firestore" | "local";
  list<T>(collection: CollectionName, options?: ListOptions): Promise<T[]>;
  get<T>(collection: CollectionName, id: string): Promise<T | null>;
  set(collection: CollectionName, id: string, data: Record<string, unknown>): Promise<void>;
  update(collection: CollectionName, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(collection: CollectionName, id: string): Promise<void>;
  /** ทุก op สำเร็จหรือพังทั้งชุด — ใช้ตอนออกบิลทั้งตึก */
  batch(ops: WriteOp[]): Promise<void>;
  /** เลขรันต้องไม่ขาดช่วงและไม่ซ้ำ */
  nextSequence(key: string): Promise<number>;
}

export function matches(doc: Record<string, unknown>, where: WhereClause[]): boolean {
  return where.every((w) => {
    const value = w.field.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], doc);
    switch (w.op) {
      case "==": return value === w.value;
      case "!=": return value !== w.value;
      case "<": return (value as number) < (w.value as number);
      case "<=": return (value as number) <= (w.value as number);
      case ">": return (value as number) > (w.value as number);
      case ">=": return (value as number) >= (w.value as number);
      case "in": return Array.isArray(w.value) && w.value.includes(value);
    }
  });
}

export function applyOptions<T>(docs: T[], options?: ListOptions): T[] {
  let result = docs;
  if (options?.where?.length) {
    result = result.filter((d) => matches(d as Record<string, unknown>, options.where!));
  }
  if (options?.orderBy) {
    const { field, dir = "asc" } = options.orderBy;
    result = [...result].sort((a, b) => {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      const cmp = av === bv ? 0 : (av ?? "") > (bv ?? "") ? 1 : -1;
      return dir === "desc" ? -cmp : cmp;
    });
  }
  if (options?.limit != null) result = result.slice(0, options.limit);
  return result;
}
