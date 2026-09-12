/**
 * นิยามข้อมูลทั้งระบบ — Wilai Communities V3
 *
 * หลักการ (ดู docs/ARCHITECTURE.md):
 *  1. ข้อมูลแต่ละอย่างมีที่อยู่ที่เดียว   ห้องไม่เก็บชื่อผู้เช่า
 *  2. cycle เป็น string 6 หลักเสมอ       "202609" ห้ามเป็น number
 *  3. ทุกเอกสารผูกกับอาคารผ่าน propertyId (V3 รองรับหลายอาคาร)
 */

/** รอบบิล "YYYYMM" — string 6 หลักเสมอ */
export type Cycle = string;

/** วันที่เก็บเป็น "YYYY-MM-DD" เพื่อไม่ให้เพี้ยนข้าม timezone */
export type IsoDate = string;

export type RoomType = "รายเดือน" | "พาณิชย์";
export type RoomCondition = "ready" | "cleaning" | "repair";
export type LeaseStatus = "active" | "ended" | "reserved";
export type BillStatus = "unpaid" | "partial" | "paid" | "void";
export type PaymentMethod = "cash" | "transfer" | "promptpay" | "other";
export type BillLineType =
  | "rent"
  | "electricity"
  | "water"
  | "ac"
  | "internet"
  | "parking"
  | "deposit"
  | "other"
  | "carryOver"
  | "discount";

/** อาคาร — ระดับบนสุด ทุกอย่างอยู่ใต้อาคารเสมอ */
/** ข้อมูลการรับชำระที่พิมพ์ลงใบแจ้งหนี้ */
export interface PaymentInfo {
  /** ช่องทาง เช่น "PromptPay / KBank" */
  method: string;
  accountName: string;
  accountNo: string;
  /** เลขที่อ้างอิงสำหรับโอน ปล่อยว่างได้ จะใช้เลขที่บิลแทน */
  reference: string;
  /** รูป QR พร้อมเพย์ (Storage หรือ data URL) */
  qrUrl: string | null;
  /** ข้อความต่อท้าย เช่น "กรุณาส่งสลิปหลังโอนผ่าน LINE" */
  note: string;
}

export interface Property {
  id: string;
  name: string;
  shortName: string;
  /** ชื่อภาษาอังกฤษ ใช้บนหัวใบแจ้งหนี้ เช่น "WILAI PLACE" */
  nameEn?: string;
  address: string;
  photoUrl: string | null;
  phone: string;
  floors: number;
  /** ค่าเริ่มต้นของอาคาร ใช้ตอนสร้างสัญญาใหม่ */
  defaultRates: Rates;
  /** วันครบกำหนดชำระของเดือนถัดไป */
  paymentDueDay: number;
  /** ชื่อผู้จัดทำที่พิมพ์ท้ายใบแจ้งหนี้ */
  preparedBy?: string;
  payment?: PaymentInfo;
  active: boolean;
}

export interface Rates {
  elec: number;
  water: number;
  ac: number;
  internet: number;
  parking: number;
}

/** ห้อง — ข้อมูลกายภาพเท่านั้น ไม่มีข้อมูลผู้เช่า */
export interface Room {
  id: string;
  propertyId: string;
  roomNo: string;
  floor: number;
  type: RoomType;
  /** ราคาป้าย ใช้ตอนห้องว่าง ไม่ใช่ค่าเช่าจริงของสัญญา */
  baseRent: number;
  /** สภาพห้อง — คนละเรื่องกับ "มีคนเช่าไหม" */
  condition: RoomCondition;
  /** จุดเชื่อมเดียวไปยังผู้เช่าปัจจุบัน */
  activeLeaseId: string | null;
  note?: string;
}

/** ผู้เช่า — ตัวบุคคล ไม่ผูกกับห้อง */
export interface Tenant {
  id: string;
  propertyId: string;
  name: string;
  nickname: string;
  phone: string;
  /** รูปผู้เช่า (Firebase Storage) */
  photoUrl: string | null;
  lineUserId: string | null;
  /** เข้ารหัสก่อนเก็บเสมอ */
  idCard: string | null;
  emergencyContact: string | null;
  note?: string;
}

/** สัญญา = ความสัมพันธ์ระหว่างคนกับห้อง */
export interface Lease {
  id: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  status: LeaseStatus;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  rent: number;
  deposit: number;
  advance: number;
  rates: Rates;
  dueDay: number;
  depositRefund: { amount: number; date: IsoDate; note: string } | null;
  /** ทำไมสัญญาถึงจบ — ว่างไว้ถ้ายัง active */
  endedReason?: string;
  note?: string;
}

export interface MeterReading {
  id: string;
  propertyId: string;
  roomId: string;
  cycle: Cycle;
  elecPrevious: number;
  elecCurrent: number;
  waterPrevious: number;
  waterCurrent: number;
  readAt: IsoDate;
  readBy: string;
}

export interface BillLine {
  type: BillLineType;
  label: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Bill {
  id: string;
  propertyId: string;
  billNo: string;
  invoiceNo: string;
  cycle: Cycle;
  roomId: string;
  roomNo: string;
  leaseId: string | null;
  /** ชื่อ ณ วันออกบิล — เปลี่ยนชื่อผู้เช่าทีหลังแล้วบิลเก่าต้องไม่เปลี่ยนตาม */
  tenantSnapshot: { tenantId: string | null; name: string; phone: string };
  lines: BillLine[];
  total: number;
  paid: number;
  balance: number;
  status: BillStatus;
  issuedAt: IsoDate;
  dueDate: IsoDate;
  sentToLineAt: string | null;
  voidReason?: string;
  note?: string;
}

export interface Payment {
  id: string;
  propertyId: string;
  receiptNo: string;
  billId: string | null;
  roomId: string;
  roomNo: string;
  amount: number;
  method: PaymentMethod;
  paidAt: IsoDate;
  slip: {
    url: string;
    verifiedBy: "slipok" | "manual";
    transRef: string | null;
    verifiedAt: string;
  } | null;
  note?: string;
}

export interface Expense {
  id: string;
  propertyId: string;
  date: IsoDate;
  category: string;
  description: string;
  amount: number;
  method: PaymentMethod;
  vendor: string;
  note?: string;
}

export type MaintenanceStatus = "open" | "in_progress" | "done" | "cancelled";
export type MaintenanceUrgency = "low" | "normal" | "urgent";

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  ticketNo: string;
  roomId: string;
  roomNo: string;
  category: string;
  problem: string;
  urgency: MaintenanceUrgency;
  status: MaintenanceStatus;
  reportedAt: IsoDate;
  reportedBy: string;
  assignedTo: string | null;
  cost: number;
  note?: string;
}

export interface UtilityCost {
  id: string;
  propertyId: string;
  cycle: Cycle;
  elecCostPerUnit: number;
  waterCostPerUnit: number;
  acCostMonthly: number;
  internetCostMonthly: number;
}

export interface AuditLog {
  id: string;
  propertyId: string | null;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  at: string;
}

export interface AllowlistEntry {
  email: string;
  role: "owner" | "manager" | "viewer";
  name: string;
  photoUrl: string | null;
  /** อาคารที่เข้าถึงได้ — ว่าง = ทุกอาคาร (เจ้าของ) */
  propertyIds: string[];
}

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  photoUrl: string | null;
  role: AllowlistEntry["role"];
  propertyIds: string[];
  demo: boolean;
}

/* ---------- view models (ประกอบจากหลาย collection สำหรับหน้าจอ) ---------- */

export interface RoomView {
  room: Room;
  lease: Lease | null;
  tenant: Tenant | null;
  lastReading: MeterReading | null;
  outstanding: number;
}

export interface PropertySummary {
  propertyId: string;
  rooms: number;
  occupied: number;
  cycle: Cycle;
  billed: number;
  collected: number;
  outstanding: number;
  billsIssued: number;
  billsPaid: number;
  openMaintenance: number;
}
