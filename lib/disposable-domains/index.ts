import { DISPOSABLE_DOMAINS } from "./domains";

const SET = new Set(DISPOSABLE_DOMAINS);

/** Doména e-mailu je jednorázová (včetně subdomén, např. `x.mailinator.com`). */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const labels = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < labels.length - 1; i++) if (SET.has(labels.slice(i).join("."))) return true;
  return false;
}

export { DISPOSABLE_DOMAINS };
