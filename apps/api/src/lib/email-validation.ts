import dns from "node:dns/promises";

/**
 * Validate that an email domain can receive mail by checking for MX records.
 * Uses Node.js built-in DNS resolver — no external dependencies.
 *
 * Fail-open on transient DNS errors (timeouts) so legitimate users aren't blocked.
 * Fail-closed on ENOTFOUND / ENODATA (domain doesn't exist or has no mail server).
 */
export async function validateEmailDomain(
  email: string,
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 1) {
    return { valid: false, reason: "Invalid email format" };
  }

  const domain = email.slice(atIndex + 1).toLowerCase().trim();
  if (!domain || domain.includes(" ")) {
    return { valid: false, reason: "Invalid email domain" };
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: "Email domain does not accept mail" };
    }
    return { valid: true };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "SERVFAIL") {
      return {
        valid: false,
        reason: "Email domain does not exist or cannot receive mail",
      };
    }
    // DNS timeout or transient error — allow signup through
    return { valid: true };
  }
}
