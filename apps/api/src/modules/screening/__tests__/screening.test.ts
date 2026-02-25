import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyCaller,
  detectSalesCall,
  getScreeningConfig,
  buildScreeningPromptSection,
} from "../screening.service.js";
import {
  resetSupabaseMocks,
  mockSupabaseAwaitResult,
} from "../../../__tests__/helpers.js";

describe("Screening Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("getScreeningConfig", () => {
    it("returns empty config when no screening KB entries exist", async () => {
      mockSupabaseAwaitResult([]);

      const config = await getScreeningConfig("org-1");

      expect(config.vipCallers).toHaveLength(0);
      expect(config.blockedCallers).toHaveLength(0);
      expect(config.customRules).toHaveLength(0);
    });

    it("categorises entries into vip, blocked, and rules", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_vip", title: "Sarah Architect", content: "Always put through. 07700900001" },
        { category: "screening_blocked", title: "XYZ Marketing", content: "SEO cold callers" },
        { category: "screening_rules", title: "Callback Times", content: "12-1pm or after 5pm" },
        { category: "screening_vip", title: "John Accountant", content: "John at Smith & Co" },
      ]);

      const config = await getScreeningConfig("org-1");

      expect(config.vipCallers).toHaveLength(2);
      expect(config.blockedCallers).toHaveLength(1);
      expect(config.customRules).toHaveLength(1);
      expect(config.vipCallers[0]!.title).toBe("Sarah Architect");
      expect(config.blockedCallers[0]!.title).toBe("XYZ Marketing");
    });
  });

  describe("classifyCaller", () => {
    it("classifies VIP caller by phone number", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_vip", title: "Sarah", content: "Sarah from the architect firm. Phone: 07700900001. Always put her through." },
      ]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-1", name: "Sarah Jones", tags: [] },
        "+447700900001",
      );

      expect(result.is_vip).toBe(true);
      expect(result.classification).toBe("vip");
      expect(result.recommendation).toBe("transfer_immediately");
    });

    it("classifies VIP caller by name match", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_vip", title: "Claire Wife", content: "Claire, Dave's wife. Always put her through." },
      ]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-2", name: "Claire Smith", tags: [] },
        "+441234567890",
      );

      expect(result.is_vip).toBe(true);
      expect(result.classification).toBe("vip");
    });

    it("classifies blocked caller", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_blocked", title: "Spam Corp", content: "Block calls from 09001234567. Spam callers." },
      ]);

      const result = await classifyCaller(
        "org-1",
        null,
        "+449001234567",
      );

      expect(result.is_blocked).toBe(true);
      expect(result.classification).toBe("blocked");
      expect(result.recommendation).toBe("block_politely");
    });

    it("classifies existing supplier from tags", async () => {
      mockSupabaseAwaitResult([]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-3", name: "BuilderMart", tags: ["supplier", "timber"] },
        "+441234567890",
      );

      expect(result.classification).toBe("supplier");
      expect(result.recommendation).toBe("handle_query");
      expect(result.is_vip).toBe(false);
      expect(result.is_blocked).toBe(false);
    });

    it("classifies existing subcontractor from tags", async () => {
      mockSupabaseAwaitResult([]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-4", name: "Mike Plumber", tags: ["subcontractor", "plumbing"] },
        "+441234567890",
      );

      expect(result.classification).toBe("subcontractor");
      expect(result.recommendation).toBe("handle_query");
    });

    it("classifies existing client with payment tags", async () => {
      mockSupabaseAwaitResult([]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-5", name: "Jane Doe", tags: ["payment-overdue", "client"] },
        "+441234567890",
      );

      expect(result.classification).toBe("existing_client");
      expect(result.recommendation).toBe("handle_or_callback");
    });

    it("classifies existing client without special tags", async () => {
      mockSupabaseAwaitResult([]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-6", name: "Bob Builder", tags: ["siteanswer-lead"] },
        "+441234567890",
      );

      expect(result.classification).toBe("existing_client");
      expect(result.recommendation).toBe("handle_or_callback");
    });

    it("classifies unknown caller as new inquiry", async () => {
      mockSupabaseAwaitResult([]);

      const result = await classifyCaller(
        "org-1",
        null,
        "+441234567890",
      );

      expect(result.classification).toBe("new_inquiry");
      expect(result.recommendation).toBe("qualify_and_callback");
      expect(result.is_vip).toBe(false);
      expect(result.is_blocked).toBe(false);
    });

    it("VIP takes priority over supplier tags", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_vip", title: "Priority Supplier", content: "BuilderMart. Always transfer." },
      ]);

      const result = await classifyCaller(
        "org-1",
        { id: "c-7", name: "BuilderMart", tags: ["supplier"] },
        "+441234567890",
      );

      expect(result.is_vip).toBe(true);
      expect(result.classification).toBe("vip");
      expect(result.recommendation).toBe("transfer_immediately");
    });
  });

  describe("detectSalesCall", () => {
    it("detects sales call from common phrases", () => {
      const result = detectSalesCall("I'm calling about your business insurance and we can save you money on your premiums");

      expect(result.is_likely_sales).toBe(true);
      expect(result.confidence).toBe("medium");
      expect(result.matched_patterns).toContain("business insurance");
      expect(result.matched_patterns).toContain("save you money");
    });

    it("detects SEO/marketing sales call", () => {
      const result = detectSalesCall("We specialise in SEO and digital marketing for construction companies");

      expect(result.is_likely_sales).toBe(true);
      expect(result.matched_patterns).toContain("we specialise in");
      expect(result.matched_patterns).toContain("seo");
      expect(result.matched_patterns).toContain("digital marketing");
    });

    it("detects recruiter call", () => {
      const result = detectSalesCall("We have tradespeople available for your current projects, staffing agency here");

      expect(result.is_likely_sales).toBe(true);
      expect(result.matched_patterns).toContain("tradespeople available");
      expect(result.matched_patterns).toContain("staffing agency");
    });

    it("detects cold call asking for decision maker", () => {
      const result = detectSalesCall("I'd like to speak to the business owner, just a quick call to introduce our services");

      expect(result.is_likely_sales).toBe(true);
      expect(result.matched_patterns).toContain("speak to the business owner");
      expect(result.matched_patterns).toContain("just a quick call to introduce");
    });

    it("returns not sales for legitimate inquiry", () => {
      const result = detectSalesCall("I'm looking at getting an extension built on my house. Could I get a quote?");

      expect(result.is_likely_sales).toBe(false);
      expect(result.matched_patterns).toHaveLength(0);
    });

    it("returns not sales for empty context", () => {
      const result = detectSalesCall("");

      expect(result.is_likely_sales).toBe(false);
      expect(result.confidence).toBe("low");
    });

    it("returns high confidence for multiple matching patterns", () => {
      const result = detectSalesCall(
        "This is a courtesy call. We've been trying to reach you about your energy costs. Are you happy with your current supplier?",
      );

      expect(result.is_likely_sales).toBe(true);
      expect(result.confidence).toBe("high");
      expect(result.matched_patterns.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("buildScreeningPromptSection", () => {
    it("includes gatekeeper rules", async () => {
      mockSupabaseAwaitResult([]);

      const section = await buildScreeningPromptSection("org-1", "Dave");

      expect(section).toContain("[GATEKEEPER RULES]");
      expect(section).toContain("Dave's gatekeeper");
      expect(section).toContain("SCREENING DECISION MATRIX");
      expect(section).toContain("SALES DETECTION");
      expect(section).toContain("ESCALATION LEVELS");
      expect(section).toContain("tag_call_outcome");
    });

    it("includes VIP callers from config", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_vip", title: "Sarah Architect", content: "Always put through. 07700900001" },
      ]);

      const section = await buildScreeningPromptSection("org-1", "Dave");

      expect(section).toContain("VIP CALLERS");
      expect(section).toContain("Sarah Architect");
      expect(section).toContain("07700900001");
    });

    it("includes blocked callers from config", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_blocked", title: "XYZ Marketing", content: "SEO cold callers, block all calls" },
      ]);

      const section = await buildScreeningPromptSection("org-1", "Dave");

      expect(section).toContain("BLOCKED CALLERS");
      expect(section).toContain("XYZ Marketing");
    });

    it("includes custom screening rules", async () => {
      mockSupabaseAwaitResult([
        { category: "screening_rules", title: "Callback Times", content: "Book callbacks between 12-1pm or after 5pm" },
      ]);

      const section = await buildScreeningPromptSection("org-1", "Dave");

      expect(section).toContain("CUSTOM SCREENING RULES");
      expect(section).toContain("Callback Times");
      expect(section).toContain("12-1pm or after 5pm");
    });

    it("uses builder name throughout prompt", async () => {
      mockSupabaseAwaitResult([]);

      const section = await buildScreeningPromptSection("org-1", "Steve");

      expect(section).toContain("Steve's gatekeeper");
      expect(section).toContain("speak to Steve");
    });
  });
});
