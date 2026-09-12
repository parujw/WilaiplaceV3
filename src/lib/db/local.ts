import "server-only";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import v2Sample from "../../../data/v2-export.sample.json";
import { migrateV2, type V2Export } from "../migrate/from-v2";
import { applyOptions, type CollectionName, type ListOptions, type Store, type WriteOp } from "./store";

/**
 * โหมดสาธิต — ไม่ต้องต่อ Firebase
 * แปลงข้อมูล V2 ด้วยตัวแปลงตัวเดียวกับสคริปต์ย้ายข้อมูลจริง
 *
 * ใช้ข้อมูลจาก data/v2-export.json ถ้ามีอยู่ในเครื่อง (ไฟล์จริง ไม่เข้า git)
 * ไม่มีก็ใช้ data/v2-export.sample.json ที่ชื่อเป็นของสมมติแทน
 * ทำแบบนี้เพราะ deploy ที่ไหนก็ตามจะไม่มีทางพาข้อมูลผู้เช่าจริงติดไปด้วยโดยไม่ตั้งใจ
 *
 * เก็บผลไว้สองแบบตามที่เขียนไฟล์ได้หรือไม่
 *   เขียนได้   (เครื่องตัวเอง)      → data/local-store.json แก้แล้วค้างอยู่
 *   เขียนไม่ได้ (serverless เช่น Vercel) → อยู่ในหน่วยความจำอย่างเดียว รีสตาร์ตแล้วหาย
 *
 * ไฟล์นี้ไม่ได้ออกแบบมาให้ใช้ในโปรดักชัน (เขียนทับทั้งไฟล์ ไม่มี concurrency control)
 * ของจริงต้องต่อ Firestore
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "local-store.json");
const REAL_EXPORT = path.join(DATA_DIR, "v2-export.json");

type Db = Record<string, Record<string, Record<string, unknown>>> & {
  counters?: Record<string, Record<string, unknown>>;
};

let cache: Db | null = null;

/** ไฟล์จริงถ้ามี ไม่มีก็ข้อมูลตัวอย่าง (import แบบ static ให้ bundler รวมไปด้วยเสมอ) */
function sourceExport(): V2Export {
  try {
    if (existsSync(REAL_EXPORT)) {
      return JSON.parse(readFileSync(REAL_EXPORT, "utf8")) as V2Export;
    }
  } catch {
    // ไฟล์จริงเสีย — ใช้ข้อมูลตัวอย่างแทนดีกว่าพังทั้งแอป
  }
  return v2Sample as unknown as V2Export;
}

function seed(): Db {
  const r = migrateV2(sourceExport());
  const byId = <T extends { id: string }>(items: T[]) =>
    Object.fromEntries(items.map((i) => [i.id, i as unknown as Record<string, unknown>]));

  const maxSeq = (nos: string[], prefix: string) =>
    nos.reduce((max, no) => {
      const m = no.startsWith(prefix) ? Number(no.slice(-4)) : 0;
      return Number.isFinite(m) ? Math.max(max, m) : max;
    }, 0);

  return {
    properties: byId([r.property]),
    rooms: byId(r.rooms),
    tenants: byId(r.tenants),
    leases: byId(r.leases),
    meterReadings: byId(r.meterReadings),
    bills: byId(r.bills),
    payments: byId(r.payments),
    expenses: {},
    maintenance: {},
    utilityCosts: byId(r.utilityCosts),
    auditLogs: {},
    allowlist: {},
    counters: {
      bill: { id: "bill", value: maxSeq(r.bills.map((b) => b.billNo), "BILL-") },
      receipt: { id: "receipt", value: maxSeq(r.payments.map((p) => p.receiptNo), "WLP-") },
      invoice: { id: "invoice", value: maxSeq(r.bills.map((b) => b.invoiceNo), "INV-") },
      maintenance: { id: "maintenance", value: 0 },
      migrationIssues: { id: "migrationIssues", value: r.issues.length, issues: r.issues },
    },
  };
}

/** เขียนไฟล์ได้ไหม — รู้ผลหลังพยายามเขียนครั้งแรก */
let persistent = true;

function load(): Db {
  if (cache) return cache;
  try {
    if (existsSync(STORE_FILE)) {
      cache = JSON.parse(readFileSync(STORE_FILE, "utf8")) as Db;
      return cache;
    }
  } catch {
    // ไฟล์เสียหรืออ่านไม่ได้ — เริ่มใหม่จากข้อมูล V2
  }
  cache = seed();
  save();
  return cache;
}

function save() {
  if (!cache || !persistent) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // ดิสก์อ่านอย่างเดียว (เช่น Vercel) — ทำงานต่อในหน่วยความจำ ไม่ต้องพยายามเขียนอีก
    persistent = false;
  }
}

/** true = แก้แล้วค้างอยู่ / false = แก้แล้วหายเมื่อเซิร์ฟเวอร์รีสตาร์ต */
export function localStoreIsPersistent(): boolean {
  load();
  return persistent;
}

function col(name: CollectionName): Record<string, Record<string, unknown>> {
  const db = load();
  db[name] ??= {};
  return db[name];
}

export const localStore: Store = {
  mode: "local",

  async list<T>(collection: CollectionName, options?: ListOptions): Promise<T[]> {
    return applyOptions(Object.values(col(collection)) as T[], options);
  },

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    return (col(collection)[id] as T) ?? null;
  },

  async set(collection, id, data) {
    col(collection)[id] = { ...data, id };
    save();
  },

  async update(collection, id, patch) {
    const current = col(collection)[id];
    if (!current) throw new Error(`ไม่พบเอกสาร ${collection}/${id}`);
    col(collection)[id] = { ...current, ...patch, id };
    save();
  },

  async remove(collection, id) {
    delete col(collection)[id];
    save();
  },

  async batch(ops: WriteOp[]) {
    const snapshot = JSON.stringify(load());
    try {
      for (const op of ops) {
        if (op.type === "delete") delete col(op.collection)[op.id];
        else if (op.type === "set") col(op.collection)[op.id] = { ...op.data, id: op.id };
        else col(op.collection)[op.id] = { ...col(op.collection)[op.id], ...op.data, id: op.id };
      }
      save();
    } catch (err) {
      cache = JSON.parse(snapshot) as Db; // rollback ทั้งชุด
      save();
      throw err;
    }
  },

  async nextSequence(key: string) {
    const counters = col("counters");
    const current = Number(counters[key]?.value ?? 0) + 1;
    counters[key] = { id: key, value: current };
    save();
    return current;
  },
};

/** ปัญหาข้อมูลที่เจอตอนย้ายจาก V2 — โชว์ในหน้าตั้งค่า */
export function localMigrationIssues(): string[] {
  return (load().counters?.migrationIssues?.issues as string[]) ?? [];
}
