import { describe, expect, it } from "vitest";
import { decrypt, emailHmac, encrypt, randomToken, sha256Hex } from "./crypto";

describe("lib/crypto", () => {
  it("šifruje a dešifruje (AES-256-GCM), pokaždé jiný šifrový text", () => {
    const a = encrypt("Jana Nováková");
    const b = encrypt("Jana Nováková");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("Jana Nováková");
  });
  it("odhalí poškozená data", () => {
    const enc = encrypt("x").split(":");
    enc[3] = Buffer.from("y").toString("base64");
    expect(() => decrypt(enc.join(":"))).toThrow();
  });
  it("HMAC e-mailu nezávisí na velikosti písmen a mezerách", () => {
    expect(emailHmac(" Jana@Example.invalid ")).toBe(emailHmac("jana@example.invalid"));
  });
  it("token a hash", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex("a")).toHaveLength(64);
  });
});
