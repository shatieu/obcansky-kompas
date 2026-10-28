import { revalidateTag } from "next/cache";
import { signatureTag } from "./read";

/** Po změně podpisu zahodí cache osobní stránky (SPEC §14.2). Mimo request scope (testy, skripty) tiše nic. */
export function revalidateSignature(id: string): void {
  try {
    revalidateTag(signatureTag(id), { expire: 0 });
  } catch {
    /* mimo Next request scope */
  }
}
