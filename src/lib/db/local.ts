import "server-only";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { migrateV2, type V2Export } from "../migrate/from-v2";
import { applyOptions, type CollectionName, type ListOptions, type Store, type WriteOp } from "./store";

/**
 * โหมดสาธิต — ไม่ต้องต่อ Firebase
 * ครั้งแรกจะอ่าน data/v2-export.json แปลงด้วยตัวแปลงตัวเดียวกับสคริปต์ย้ายข้อมูลจริง
 * แล้วเก็บผลลงไฟล์ data/local-store.json เพื่อให้แก้ไขแล้วค้างอยู่
 *
 * ไฟล์นี้ไม่ได้ออกแบบมาให้ใช้ในโปรดักชัน (เขียนทับทั้งไฟล์ ไม่มี concurrency control)
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "local-store.json");
const V2_FILE = path.join(DATA_DIR, "v2-export.json");

type Db = Record<string, Record<string, Record<string, unknown>>> & {
  counters?: Record<string, Record<string, unknown>>;
};

let cache: Db | null = null;

function seed(): Db {
  const v2 = JSON.parse(readFileSync(V2_FILE, "utf8")) as V2Export;
  const r = migrateV2(v2);
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

function load(): Db {
  if (cache) return cache;
  if (existsSync(STORE_FILE)) {
    cache = JSON.parse(readFileSync(STORE_FILE, "utf8")) as Db;
  } else {
    cache = seed();
    save();
  }
  return cache!;
}

function save() {
  if (!cache) return;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));
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
