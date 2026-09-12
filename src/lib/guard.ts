import "server-only";
import { redirect } from "next/navigation";
import { listProperties } from "./repo";
import { getSelectedPropertyId, getSessionUser } from "./session";
import type { Property, SessionUser } from "./types";

export interface AppContext {
  user: SessionUser;
  property: Property;
  properties: Property[];
}

/**
 * ทุกหน้าที่อยู่หลังล็อกอินเรียกอันนี้ก่อน
 *   ไม่ได้ล็อกอิน      → /login
 *   ล็อกอินแล้วแต่ยังไม่เลือกอาคาร (หรือเลือกอาคารที่ไม่มีสิทธิ์) → /select
 */
export async function requireContext(): Promise<AppContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const properties = await listProperties(user);
  if (properties.length === 0) redirect("/select");

  const selectedId = await getSelectedPropertyId();
  const property = properties.find((p) => p.id === selectedId);
  if (!property) redirect("/select");

  return { user, property, properties };
}
