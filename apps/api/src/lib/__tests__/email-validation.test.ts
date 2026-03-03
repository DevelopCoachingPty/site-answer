import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEmailDomain } from "../email-validation.js";

// Mock the dns module
vi.mock("node:dns/promises", () => ({
  default: {
    resolveMx: vi.fn(),
  },
}));

import dns from "node:dns/promises";

const mockResolveMx = dns.resolveMx as ReturnType<typeof vi.fn>;

describe("validateEmailDomain", () => {
  beforeEach(() => {
    mockResolveMx.mockReset();
  });

  it("returns valid for domain with MX records", async () => {
    mockResolveMx.mockResolvedValue([{ exchange: "mx.google.com", priority: 10 }]);

    const result = await validateEmailDomain("user@gmail.com");
    expect(result).toEqual({ valid: true });
    expect(mockResolveMx).toHaveBeenCalledWith("gmail.com");
  });

  it("returns invalid for domain with no MX records (ENOTFOUND)", async () => {
    const err = new Error("queryMx ENOTFOUND") as NodeJS.ErrnoException;
    err.code = "ENOTFOUND";
    mockResolveMx.mockRejectedValue(err);

    const result = await validateEmailDomain("user@doesnotexist12345.com");
    expect(result).toEqual({
      valid: false,
      reason: "Email domain does not exist or cannot receive mail",
    });
  });

  it("returns invalid for domain with ENODATA", async () => {
    const err = new Error("queryMx ENODATA") as NodeJS.ErrnoException;
    err.code = "ENODATA";
    mockResolveMx.mockRejectedValue(err);

    const result = await validateEmailDomain("user@no-mx-records.example");
    expect(result).toEqual({
      valid: false,
      reason: "Email domain does not exist or cannot receive mail",
    });
  });

  it("fails open on DNS timeout (allows signup)", async () => {
    const err = new Error("queryMx ETIMEOUT") as NodeJS.ErrnoException;
    err.code = "ETIMEOUT";
    mockResolveMx.mockRejectedValue(err);

    const result = await validateEmailDomain("user@slow-dns.com");
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid for missing @ in email", async () => {
    const result = await validateEmailDomain("not-an-email");
    expect(result).toEqual({ valid: false, reason: "Invalid email format" });
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it("returns invalid for empty domain after @", async () => {
    const result = await validateEmailDomain("user@");
    expect(result).toEqual({ valid: false, reason: "Invalid email domain" });
    expect(mockResolveMx).not.toHaveBeenCalled();
  });
});
