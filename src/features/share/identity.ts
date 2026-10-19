// Visitor annotation identity: no login needed; the browser generates a random key locally (the server stores only its sha256),
// so the same browser can delete/resolve its own annotations; the nickname is entered on the first annotation and reused after.

export interface GuestIdentity {
  name: string;
  key: string;
}

const STORE_KEY = "xedit-share-identity";

export function loadIdentity(): GuestIdentity {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    if (typeof raw.key === "string" && raw.key.length >= 16) {
      return { name: typeof raw.name === "string" ? raw.name : "", key: raw.key };
    }
  } catch {
    // Regenerate if parsing fails
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const identity = {
    name: "",
    key: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(identity));
  return identity;
}

export function saveIdentityName(name: string): void {
  const identity = loadIdentity();
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...identity, name: name.slice(0, 30) }));
}
