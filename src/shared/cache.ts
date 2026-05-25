// Lightweight sessionStorage wrapper with TTL support

interface CacheEnvelope<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const env = JSON.parse(raw) as CacheEnvelope<T>;
      if (env.expiresAt < Date.now()) {
        sessionStorage.removeItem(key);
        return null;
      }
      return env.value;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    try {
      const env: CacheEnvelope<T> = { value, expiresAt: Date.now() + ttlMs };
      sessionStorage.setItem(key, JSON.stringify(env));
    } catch {
      // sessionStorage may be unavailable in some Outlook hosts (e.g., mobile)
      // Silently fail — caller will re-fetch
    }
  }

  delete(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  clear(): void {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }
}
