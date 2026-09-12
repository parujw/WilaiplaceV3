import { afterEach, describe, expect, it } from "vitest";
import { env } from "./env";

const KEY = "TEST_ENV_VALUE";
afterEach(() => { delete process.env[KEY]; });

describe("env", () => {
  it("คืนค่าปกติตามเดิม", () => {
    process.env[KEY] = "AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w";
    expect(env(KEY)).toBe("AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w");
  });

  it("ตัดช่องว่างและบรรทัดใหม่ที่ติดมาตอนวาง", () => {
    process.env[KEY] = "  AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w\n";
    expect(env(KEY)).toBe("AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w");
  });

  it("ถอดเครื่องหมายคำพูดที่ครอบมาจากไฟล์ .env", () => {
    process.env[KEY] = '"AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w"';
    expect(env(KEY)).toBe("AIzaSyBetYhDsTFYQYB2o-8YEwcuubBXwNIpF5w");
    process.env[KEY] = "'wilaiplacev3'";
    expect(env(KEY)).toBe("wilaiplacev3");
  });

  it("ลบอักขระล่องหนที่ติดมาจากการก๊อปในเว็บ", () => {
    process.env[KEY] = "﻿wilaiplacev3​";
    expect(env(KEY)).toBe("wilaiplacev3");
  });

  it("ไม่แตะเครื่องหมายคำพูดที่อยู่กลางค่า", () => {
    process.env[KEY] = 'a"b';
    expect(env(KEY)).toBe('a"b');
  });

  it("ค่าว่างถือว่าไม่ได้ตั้ง", () => {
    process.env[KEY] = "   ";
    expect(env(KEY)).toBeUndefined();
    expect(env("NEVER_SET_ANYWHERE")).toBeUndefined();
  });

  it("private key ที่ครอบด้วยคำพูด ถอดคำพูดออกแต่คง \\n ตัวอักษรไว้ครบ", () => {
    // \n ในค่าเป็นตัวอักษรสองตัว ไม่ใช่ขึ้นบรรทัดจริง firebase-admin จะแปลงเองทีหลัง
    process.env[KEY] = '"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"';
    expect(env(KEY)).toBe("-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n");
  });
});
