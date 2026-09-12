"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

export const firebaseReady = Boolean(config.apiKey && config.authDomain && config.projectId);

export function clientApp() {
  if (!firebaseReady) throw new Error("ยังไม่ได้ตั้งค่า Firebase ฝั่ง client");
  return getApps().length ? getApp() : initializeApp(config);
}

/** ล็อกอิน Google แล้วคืน ID token ให้ server แลกเป็น session cookie */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(clientApp());
  auth.languageCode = "th";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}
