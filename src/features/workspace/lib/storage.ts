/** localStorage 读写包装：隐私模式 / 配额耗尽时静默降级，不打断交互 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 忽略
  }
}
