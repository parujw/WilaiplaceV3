import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import type { CollectionName, ListOptions, Store, WriteOp } from "./store";

export const firestoreStore: Store = {
  mode: "firestore",

  async list<T>(collection: CollectionName, options?: ListOptions): Promise<T[]> {
    let query = adminDb().collection(collection) as FirebaseFirestore.Query;
    for (const w of options?.where ?? []) query = query.where(w.field, w.op, w.value);
    if (options?.orderBy) query = query.orderBy(options.orderBy.field, options.orderBy.dir ?? "asc");
    if (options?.limit != null) query = query.limit(options.limit);
    const snap = await query.get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
  },

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    const doc = await adminDb().collection(collection).doc(id).get();
    return doc.exists ? ({ ...doc.data(), id: doc.id } as T) : null;
  },

  async set(collection, id, data) {
    await adminDb().collection(collection).doc(id).set({ ...data, id });
  },

  async update(collection, id, patch) {
    await adminDb().collection(collection).doc(id).update(patch);
  },

  async remove(collection, id) {
    await adminDb().collection(collection).doc(id).delete();
  },

  async batch(ops: WriteOp[]) {
    const db = adminDb();
    const writer = db.batch();
    for (const op of ops) {
      const ref = db.collection(op.collection).doc(op.id);
      if (op.type === "delete") writer.delete(ref);
      else if (op.type === "set") writer.set(ref, { ...op.data, id: op.id });
      else writer.update(ref, op.data!);
    }
    await writer.commit();
  },

  async nextSequence(key: string) {
    const ref = adminDb().collection("counters").doc(key);
    return adminDb().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const next = Number(doc.data()?.value ?? 0) + 1;
      tx.set(ref, { id: key, value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return next;
    });
  },
};
