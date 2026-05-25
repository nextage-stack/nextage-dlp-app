import { findCustomersInRecipients, getUserPermission } from "../src/validators/shared";
import { customer, exemption } from "./fixtures";

describe("getUserPermission", () => {
  it("returns STANDARD when no exemption matches", () => {
    expect(getUserPermission("nobody@nextage.co.il", [])).toBe("STANDARD");
  });

  it("returns the exemption type for a matching active row", () => {
    const ex = exemption({
      userEmail: "user@nextage.co.il",
      exemptionType: "CHECK_2_BYPASS",
    });
    expect(getUserPermission("user@nextage.co.il", [ex])).toBe("CHECK_2_BYPASS");
  });

  it("is case-insensitive on email", () => {
    const ex = exemption({ userEmail: "User@Nextage.CO.IL" });
    expect(getUserPermission("user@nextage.co.il", [ex])).toBe("ALL_CHECKS");
  });

  it("ignores exemptions whose expiryDate is in the past", () => {
    const ex = exemption({
      userEmail: "user@nextage.co.il",
      expiryDate: "2020-01-01T00:00:00Z",
    });
    expect(getUserPermission("user@nextage.co.il", [ex])).toBe("STANDARD");
  });
});

describe("findCustomersInRecipients", () => {
  const acme = customer({
    id: "c-acme",
    customerName: "AcmeCorp",
    primaryDomain: "acme.com",
    additionalDomains: ["acme.co.uk"],
  });
  const stark = customer({
    id: "c-stark",
    customerName: "Stark",
    primaryDomain: "stark.com",
  });

  it("matches by primary domain", () => {
    const found = findCustomersInRecipients(["finance@acme.com"], [acme, stark]);
    expect(found.map((c) => c.id)).toEqual(["c-acme"]);
  });

  it("matches by additional domain", () => {
    const found = findCustomersInRecipients(["finance@acme.co.uk"], [acme, stark]);
    expect(found.map((c) => c.id)).toEqual(["c-acme"]);
  });

  it("de-duplicates by customer id", () => {
    const found = findCustomersInRecipients(
      ["a@acme.com", "b@acme.co.uk", "c@acme.com"],
      [acme],
    );
    expect(found).toHaveLength(1);
  });

  it("skips INACTIVE customers", () => {
    const inactive = customer({ ...acme, status: "INACTIVE" });
    const found = findCustomersInRecipients(["finance@acme.com"], [inactive]);
    expect(found).toEqual([]);
  });
});
