// 访客批注身份：无需登录，浏览器本地生成随机 key（服务端只存其 sha256），
// 同一浏览器可删除/销记自己的批注；昵称首次批注时填写，之后复用。

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
    // 解析失败则重新生成
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
