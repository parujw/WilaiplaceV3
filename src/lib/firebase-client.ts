"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

import { prefersRedirect, resolveAuthDomain } from "./auth-flow";
import type { FirebaseWebConfig } from "./firebase-config";

/**
 * config ส่งมาจาก server เป็น prop ไม่ได้อ่าน process.env ตรงนี้
 * เพราะ NEXT_PUBLIC_* ถูกฝังตอน build ถ้า deploy ด้วย cache เดิมค่าใหม่จะไม่เข้า
 */
export function clientApp(config: FirebaseWebConfig) {
  if (getApps().length) return getApp();

  const authDomain = resolveAuthDomain({
    configured: config.authDomainPinned ? config.authDomain : null,
    fallback: config.authDomain,
    host: typeof window === "undefined" ? "" : window.location.host,
    protocol: typeof window === "undefined" ? "" : window.location.protocol,
    // ค่านี้ถูกฝังตอน build คู่กับ rewrite ใน next.config.ts จึงเชื่อถือได้ว่าตรงกัน
    proxiedProject: process.env.NEXT_PUBLIC_AUTH_PROXY_PROJECT ?? "",
    projectId: config.projectId,
  });

  return initializeApp({
    apiKey: config.apiKey,
    authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
  });
}

function googleAuth(config: FirebaseWebConfig) {
  const auth = getAuth(clientApp(config));
  auth.languageCode = "th";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return { auth, provider };
}

/** ควรพาออกจากหน้าเว็บไปเลยไหม หรือเปิดป็อปอัปได้ */
export function shouldRedirectToSignIn(): boolean {
  if (typeof navigator === "undefined") return false;
  return prefersRedirect(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/**
 * ล็อกอินด้วยป็อปอัป แล้วคืน ID token ให้ server แลกเป็น session cookie
 * ใช้บนเดสก์ท็อปซึ่งป็อปอัปทำงานได้จริงและไม่ต้องออกจากหน้าเดิม
 */
export async function signInWithGoogle(config: FirebaseWebConfig): Promise<string> {
  const { auth, provider } = googleAuth(config);
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}

/**
 * ล็อกอินโดยพาออกจากหน้าเว็บไปที่ Google
 *
 * ฟังก์ชันนี้ไม่คืนค่าเมื่อสำเร็จ เพราะเบราว์เซอร์จะเปลี่ยนหน้าไปก่อน
 * ผลลัพธ์กลับมาตอนเปิดหน้านี้ใหม่ ต้องไปรับด้วย finishGoogleRedirect
 */
export async function startGoogleRedirect(config: FirebaseWebConfig): Promise<void> {
  const { auth, provider } = googleAuth(config);
  await signInWithRedirect(auth, provider);
}

/** รับผลจาก startGoogleRedirect — null = ไม่ได้กลับมาจากการล็อกอิน */
export async function finishGoogleRedirect(config: FirebaseWebConfig): Promise<string | null> {
  const { auth } = googleAuth(config);
  const credential = await getRedirectResult(auth);
  if (!credential) return null;
  return credential.user.getIdToken();
}
