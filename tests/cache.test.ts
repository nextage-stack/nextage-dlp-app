import { CacheService } from "../src/shared/cache";

describe("CacheService", () => {
  let cache: CacheService;

  beforeEach(() => {
    sessionStorage.clear();
    cache = new CacheService();
  });

  describe("get/set", () => {
    it("returns the stored value within TTL", () => {
      cache.set("k", { foo: "bar" }, 1000);
      expect(cache.get<{ foo: string }>("k")).toEqual({ foo: "bar" });
    });

    it("returns null for a missing key", () => {
      expect(cache.get("nope")).toBeNull();
    });

    it("returns null and evicts when TTL has expired", () => {
      cache.set("k", "v", 1000);
      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
      expect(cache.get("k")).toBeNull();
      jest.spyOn(Date, "now").mockRestore();
      expect(sessionStorage.getItem("k")).toBeNull();
    });

    it("returns null when stored value is unparseable JSON", () => {
      sessionStorage.setItem("k", "{not json");
      expect(cache.get("k")).toBeNull();
    });

    it("does not throw when sessionStorage.setItem fails (e.g. quota)", () => {
      const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      expect(() => cache.set("k", "v", 1000)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("delete", () => {
    it("removes a stored key", () => {
      cache.set("k", "v", 1000);
      cache.delete("k");
      expect(cache.get("k")).toBeNull();
    });

    it("swallows errors from sessionStorage.removeItem", () => {
      const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("nope");
      });
      expect(() => cache.delete("k")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("clear", () => {
    it("clears all keys", () => {
      cache.set("a", 1, 1000);
      cache.set("b", 2, 1000);
      cache.clear();
      expect(cache.get("a")).toBeNull();
      expect(cache.get("b")).toBeNull();
    });

    it("swallows errors from sessionStorage.clear", () => {
      const spy = jest.spyOn(Storage.prototype, "clear").mockImplementation(() => {
        throw new Error("nope");
      });
      expect(() => cache.clear()).not.toThrow();
      spy.mockRestore();
    });
  });
});
