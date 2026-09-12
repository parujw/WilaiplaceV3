# Wilai Communities V3 — สถาปัตยกรรม

## ขอบเขต

V3 ไม่ได้เป็นแค่ "วิไลเพลส" อีกต่อไป ข้อมูลชุดเดิมทั้งหมดจาก V2 คืออาคารแรกชื่อ
**วิไลเพลส 1** (`wlp1`) อยู่ภายใต้ร่มเดียวกันชื่อ **Wilai Communities**
ทุกเอกสารในระบบผูกกับอาคารผ่าน `propertyId` เพิ่มอาคารที่ 2, 3 ได้โดยไม่ต้องแก้โครงสร้าง

## ทำไมต้อง V3

V2 (Google Apps Script + Sheets) ใช้งานได้จริงมา 1 ปี แต่ชนเพดาน 5 เรื่อง:

| ปัญหาใน V2 | สาเหตุ | V3 แก้อย่างไร |
|---|---|---|
| ข้อมูลผู้เช่าเพี้ยนระหว่างชีต "ห้อง" กับ "ผู้เช่า" | เก็บชื่อ/ค่าเช่า/วันหมดสัญญาซ้ำกัน 2 ที่ | เก็บที่เดียว ห้องอ้างอิงสัญญาผ่าน `activeLeaseId` |
| ลบ/แก้บิลแล้วไม่มีหลักฐาน | ไม่มี audit log | ทุกการเขียนบันทึกลง `auditLogs` |
| ใครมีลิงก์ก็เข้าได้ | Apps Script deploy แบบ "Anyone" | Firebase Auth + allowlist + Firestore Rules |
| ออกบิล 17 ห้องต้องทำ 17 รอบ | ฟอร์มออกแบบทีละห้อง | หน้าจดมิเตอร์ทั้งตึก → ออกบิลชุดเดียว |
| รองรับได้อาคารเดียว | ทุกชีตสมมติว่ามีตึกเดียว | ทุก collection มี `propertyId` + หน้าเลือกอาคาร |

## Stack

- **Next.js 15 (App Router) + TypeScript** — deploy บน Vercel
- **Firebase**: Firestore (ข้อมูล), Auth (ล็อกอิน Google), Storage (รูปผู้เช่า/รูปอาคาร)
- **Tailwind CSS v4** — ธีมเดียว มือถือมาก่อน
- **โหมดสาธิต** — ถ้ายังไม่ตั้งค่า Firebase แอปอ่านข้อมูล V2 ที่ย้ายแล้วจากไฟล์ในเครื่อง
  ใช้ตัวแปลงตัวเดียวกับสคริปต์ย้ายข้อมูลจริง จึงเห็นของจริงตั้งแต่เปิดครั้งแรก

## โครงสร้างข้อมูล (Firestore)

หลักการ: **ข้อมูลแต่ละอย่างมีที่อยู่ที่เดียว** ห้ามเก็บซ้ำ

```
properties/{propertyId}            # อาคาร — ระดับบนสุด
  name: "วิไลเพลส 1"
  shortName: "WLP1"
  address, phone, photoUrl, floors
  defaultRates: { elec, water, ac, internet, parking }
  paymentDueDay: 5

rooms/{roomId}                     # ข้อมูลกายภาพของห้อง ไม่มีข้อมูลผู้เช่า
  propertyId
  roomNo: "402"
  floor: 4
  type: "รายเดือน" | "พาณิชย์"
  baseRent: 3500                   # ราคาป้าย ใช้ตอนห้องว่าง
  condition: "ready" | "cleaning" | "repair"   # สภาพห้อง ไม่ใช่สถานะเช่า
  activeLeaseId: string | null     # ← ชี้ไปที่สัญญาปัจจุบัน (จุดเชื่อมเดียว)

tenants/{tenantId}                 # ตัวบุคคล ไม่ผูกกับห้อง
  propertyId, name, nickname, phone
  photoUrl                         # รูปผู้เช่า (Storage หรือ data URL ในโหมดสาธิต)
  lineUserId, idCard(เข้ารหัส), emergencyContact

leases/{leaseId}                   # สัญญา = ความสัมพันธ์ระหว่างคนกับห้อง
  propertyId, roomId, tenantId
  status: "active" | "ended" | "reserved"
  startDate, endDate               # "YYYY-MM-DD"
  rent, deposit, advance, dueDay
  rates: { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 }
  depositRefund: { amount, date, note } | null

meterReadings/{readingId}          # การจดมิเตอร์ แยกจากบิล
  propertyId, roomId, cycle: "202609"
  elecPrevious, elecCurrent, waterPrevious, waterCurrent
  readAt, readBy

bills/{billId}
  propertyId, billNo, invoiceNo
  cycle: "202609"                  # เดือนค่าเช่า — string 6 หลักเสมอ
  roomId, roomNo, leaseId
  tenantSnapshot: { tenantId, name, phone }   # ชื่อ ณ วันออกบิล
  lines: [{ type, label, qty, rate, amount }]
  total, paid, balance
  status: "unpaid" | "partial" | "paid" | "void"
  issuedAt, dueDate, sentToLineAt, voidReason

payments/{paymentId}
  propertyId, receiptNo, billId, roomId, roomNo
  amount, method, paidAt
  slip: { url, verifiedBy: "slipok"|"manual", transRef, verifiedAt } | null

expenses/{expenseId}               propertyId, date, category, description, amount, method, vendor
maintenance/{ticketId}             propertyId, ticketNo, roomId, category, problem, urgency, status, cost
utilityCosts/{docId}               propertyId, cycle, elecCostPerUnit, waterCostPerUnit, ...
counters/{key}                     เลขรัน bill / invoice / receipt / maintenance
allowlist/{email}                  role, name, propertyIds  (ว่าง = ทุกอาคาร)

auditLogs/{logId}                  # ทุกการเขียนต้องมี
  propertyId, actorUid, actorEmail
  action: "bill.issue-batch" | "bill.void" | "payment.create" | "tenant.photo.update" | ...
  targetType, targetId, before, after, at
```

### จุดสำคัญที่แก้ปัญหาเดิม

1. **ห้องไม่เก็บชื่อผู้เช่า** — อยากรู้ว่าใครอยู่ห้อง 402 ให้ตาม
   `activeLeaseId` → `leases` → `tenantId` → `tenants` ไม่มีทางเพี้ยนเพราะมีที่เดียว

2. **แยก "สภาพห้อง" กับ "สถานะเช่า"** — V2 ปนกันใน field เดียว ทำให้ห้องที่มีผู้เช่าแต่กำลังซ่อมบันทึกไม่ได้
   V3 แยก `condition` (สภาพ) กับการมี `activeLeaseId` (มีคนเช่าไหม)

3. **`cycle` เป็น string 6 หลักเสมอ** — บั๊ก `.slice is not a function` ใน V2 เกิดเพราะ Sheets คืนเป็น number

4. **`tenantSnapshot` ในบิล** — เปลี่ยนชื่อผู้เช่าทีหลัง บิลเก่าไม่เปลี่ยนตาม (สำคัญเชิงบัญชี)

5. **ย้ายห้อง = ปิดสัญญาเก่า + เปิดสัญญาใหม่** ไม่ใช่แก้ field ห้อง ทำให้มีประวัติครบ

6. **บิลลบไม่ได้** — `void` ได้ แต่เลขรันไม่ขาดช่วง และยกเลิกไม่ได้ถ้ามีการรับชำระแล้ว

## ชั้นของโค้ด

```
หน้าจอ (src/app/**)  →  repo.ts  →  db/store.ts (สัญญา)  →  firestore.ts | local.ts
                                         ↑
                          หน้าจอไม่เรียก store ตรงๆ และไม่รู้ว่าข้อมูลอยู่ที่ไหน
```

- `src/lib/billing.ts` — คำนวณบิลล้วนๆ ไม่แตะฐานข้อมูล ทดสอบด้วย vitest
- `src/lib/migrate/from-v2.ts` — ตัวแปลง V2 → V3 ตัวเดียว ใช้ทั้งสคริปต์ย้ายจริงและโหมดสาธิต
- `src/lib/guard.ts` — ทุกหน้าหลังล็อกอินเรียก `requireContext()` ก่อน
  (ไม่ล็อกอิน → `/login`, ยังไม่เลือกอาคาร → `/select`)

## Flow ที่ออกแบบใหม่ — เน้นงานที่ทำบ่อย

### รอบเดือน (งานหลัก ทำทุกเดือน)

```
1. จดมิเตอร์        /meter — หน้าเดียวทั้งตึก กรอกไล่ลงมา เห็นยอดรวมสดๆ
2. ตรวจทานบิล       ยอดแต่ละห้องคำนวณให้ทันทีขณะพิมพ์
3. ออกบิล           ปุ่มเดียว ออกครบทุกห้องใน batch เดียว ยกยอดค้างเดิมเข้าบิลใหม่อัตโนมัติ
4. รับชำระ          /payments หรือในหน้าบิล → ออกใบเสร็จ ปรับสถานะบิลให้ตรงกัน
```

### งานประปราย
- ผู้เช่าเข้า/ย้ายออก/ย้ายห้อง · แจ้งซ่อม · ดูรายงาน

## ความปลอดภัย

- Firebase Auth (Google Sign-in) — ล็อกอินสำเร็จยังไม่พอ ต้องอยู่ใน `allowlist` ด้วย
- ใบแจ้งหนี้เปิดได้โดยไม่ต้องล็อกอิน แต่ URL ต้องมีโทเคนที่คำนวณจาก `AUTH_SECRET`
  เลขบิลเป็นเลขรันจึงไล่เดาได้ ถ้าไม่มีโทเคนใครก็อ่านชื่อผู้เช่าและยอดเงินของทุกห้อง
  (เลือกวิธี derive แทนสุ่มเก็บในบิล เพื่อไม่ต้อง backfill และให้ลิงก์คงที่ทุก instance
  แลกกับเพิกถอนรายใบไม่ได้ — เปลี่ยน `AUTH_SECRET` คือลิงก์เก่าตายหมด)
- โหมดสาธิตปิดอัตโนมัติเมื่อรันแบบ production เพราะข้อมูลผู้เช่าเป็นข้อมูลจริง
- Session cookie เป็น httpOnly ตรวจทุก request ฝั่ง server
- Firestore Rules: ฝั่ง client อ่านได้อย่างเดียวและเฉพาะอาคารที่มีสิทธิ์ เขียนไม่ได้เลย
  ทุกการเขียนผ่าน API ฝั่งเซิร์ฟเวอร์ที่บันทึก audit log
- `auditLogs` และ `counters` ฝั่ง client แตะไม่ได้
- API keys (SlipOK, LINE) อยู่ใน Environment Variables เท่านั้น ไม่อยู่ใน client

## ที่ยังไม่ได้ทำ

- LINE webhook + ส่งบิลเข้าไลน์ (โครงข้อมูลรองรับแล้ว: `tenants.lineUserId`, `bills.sentToLineAt`)
- ตรวจสลิปอัตโนมัติด้วย SlipOK (`payments.slip` เตรียมที่ไว้แล้ว)
- หน้าเพิ่ม/ย้าย/ปิดสัญญาผู้เช่าในแอป (ตอนนี้ย้ายมาจาก V2 และแก้ผ่านสคริปต์)
- บันทึกค่าใช้จ่าย (`expenses`) และรายงานกำไรขาดทุน
