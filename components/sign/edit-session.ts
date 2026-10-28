/** Rozpracovaná úprava podpisu (token z e-mailu) mezi /kompas a /kompas/podpis. Jen sessionStorage. */
export const EDIT_SESSION_KEY = "obcansky-kompas:edit";

export interface EditSession {
  token: string;
  showName: boolean;
  signatureId: string;
}

export function loadEditSession(): EditSession | null {
  try {
    const raw = window.sessionStorage.getItem(EDIT_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<EditSession>;
    return typeof v.token === "string" && typeof v.signatureId === "string"
      ? { token: v.token, signatureId: v.signatureId, showName: v.showName === true }
      : null;
  } catch {
    return null;
  }
}

export function saveEditSession(s: EditSession): void {
  try {
    window.sessionStorage.setItem(EDIT_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* bez úložiště úprava nepůjde přes kompas – zůstane jen odvolání */
  }
}

export function clearEditSession(): void {
  try {
    window.sessionStorage.removeItem(EDIT_SESSION_KEY);
  } catch {
    /* nic */
  }
}
