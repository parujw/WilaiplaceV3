"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";

import type { FirebaseWebConfig } from "./firebase-config";

/**
 * config ส่งมาจาก server เป็น prop ไม่ได้อ่าน process.env ตรงนี้
 * เพราะ NEXT_PUBLIC_* ถูกฝังตอน build ถ้า deploy ด้วย cache เดิมค่าใหม่จะไม่เข้า
 */
export function clientApp(config: FirebaseWebConfig) {
  return getApps().length ? getApp() : initializeApp(config);
}

/** ล็อกอิน Google แล้วคืน ID token ให้ server แลกเป็น session cookie */
export async function signInWithGoogle(config: FirebaseWebConfig): Promise<string> {
  const auth = getAuth(clientApp(config));
  auth.languageCode = "th";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}
