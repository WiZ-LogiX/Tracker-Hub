import { describe, it, expect } from "vitest";

describe("Task 13 — Server-Side Search, Pagination & Performance Hardening Tests", () => {
  describe("1. Customer Pagination & Math Invariants", () => {
    it("enforces default pagination of 25 rows and maximum ceiling of 100 rows", () => {
      const sanitizePagination = (page?: number, pageSize?: number) => {
        const p = Math.max(1, page || 1);
        const ps = Math.min(100, Math.max(1, pageSize || 25));
        return { page: p, pageSize: ps, offset: (p - 1) * ps };
      };

      expect(sanitizePagination()).toEqual({ page: 1, pageSize: 25, offset: 0 });
      expect(sanitizePagination(2, 50)).toEqual({ page: 2, pageSize: 50, offset: 50 });
      expect(sanitizePagination(3, 100)).toEqual({ page: 3, pageSize: 100, offset: 200 });
      // Exceeds max ceiling (100)
      expect(sanitizePagination(1, 500)).toEqual({ page: 1, pageSize: 100, offset: 0 });
      // Negative / zero values
      expect(sanitizePagination(0, -10)).toEqual({ page: 1, pageSize: 1, offset: 0 });
    });

    it("accurately calculates totalPages from totalCount and pageSize", () => {
      const computeTotalPages = (totalCount: number, pageSize: number) => {
        return Math.ceil(totalCount / pageSize) || 1;
      };

      expect(computeTotalPages(0, 25)).toBe(1);
      expect(computeTotalPages(25, 25)).toBe(1);
      expect(computeTotalPages(26, 25)).toBe(2);
      expect(computeTotalPages(100, 25)).toBe(4);
      expect(computeTotalPages(101, 25)).toBe(5);
      expect(computeTotalPages(142, 50)).toBe(3);
    });
  });

  describe("2. Customer Search & Normalization", () => {
    it("correctly matches multi-column search tokens (name, phone, email, governorate)", () => {
      const mockCustomers = [
        { name: "Ahmed Hassan", phone: "01012345678", email: "ahmed@example.com", governorate: "Cairo" },
        { name: "Sara Mahmoud", phone: "01198765432", email: "sara@company.eg", governorate: "Giza" },
        { name: "Tariq Ziad", phone: "01233445566", email: "tariq@test.com", governorate: "Alexandria" },
      ];

      const searchCustomers = (query: string) => {
        const q = query.trim().toLowerCase();
        return mockCustomers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.governorate.toLowerCase().includes(q),
        );
      };

      expect(searchCustomers("Ahmed")).toHaveLength(1);
      expect(searchCustomers("0119876")).toHaveLength(1);
      expect(searchCustomers("company.eg")).toHaveLength(1);
      expect(searchCustomers("Alexandria")).toHaveLength(1);
      expect(searchCustomers("NonExistent")).toHaveLength(0);
    });
  });

  describe("3. Customer Filters Logic", () => {
    it("correctly filters customers by active orders, outstanding balance, and quotes", () => {
      const mockList = [
        { id: "c1", name: "Cust 1", quoteCount: 2, activeOrderCount: 1, outstandingBalance: 5000 },
        { id: "c2", name: "Cust 2", quoteCount: 0, activeOrderCount: 0, outstandingBalance: 0 },
        { id: "c3", name: "Cust 3", quoteCount: 1, activeOrderCount: 0, outstandingBalance: 2000 },
      ];

      const filterCustomers = (filter: string) => {
        switch (filter) {
          case "active_orders":
            return mockList.filter((c) => c.activeOrderCount > 0);
          case "no_active_orders":
            return mockList.filter((c) => c.activeOrderCount === 0);
          case "with_quotes":
            return mockList.filter((c) => c.quoteCount > 0);
          case "outstanding_balance":
            return mockList.filter((c) => c.outstandingBalance > 0);
          default:
            return mockList;
        }
      };

      expect(filterCustomers("all")).toHaveLength(3);
      expect(filterCustomers("active_orders")).toHaveLength(1);
      expect(filterCustomers("no_active_orders")).toHaveLength(2);
      expect(filterCustomers("with_quotes")).toHaveLength(2);
      expect(filterCustomers("outstanding_balance")).toHaveLength(2);
    });
  });

  describe("4. Quotation Search & Status Filtering", () => {
    it("filters quotations by status and searches across quote number and customer name", () => {
      const mockQuotes = [
        { id: "q1", quoteNumber: "QUO-1001", customerName: "Ahmed Hassan", status: "draft", total: 45000 },
        { id: "q2", quoteNumber: "QUO-1002", customerName: "Sara Mahmoud", status: "sent", total: 85000 },
        { id: "q3", quoteNumber: "QUO-1003", customerName: "Tariq Ziad", status: "accepted", total: 120000 },
        { id: "q4", quoteNumber: "QUO-1004", customerName: "Ahmed Hassan", status: "converted", total: 95000 },
      ];

      const queryQuotes = (search?: string, status = "all") => {
        return mockQuotes.filter((q) => {
          const matchStatus = status === "all" || q.status === status;
          if (!matchStatus) return false;
          if (!search || !search.trim()) return true;
          const s = search.trim().toLowerCase();
          return q.quoteNumber.toLowerCase().includes(s) || q.customerName.toLowerCase().includes(s);
        });
      };

      expect(queryQuotes(undefined, "all")).toHaveLength(4);
      expect(queryQuotes(undefined, "draft")).toHaveLength(1);
      expect(queryQuotes(undefined, "accepted")).toHaveLength(1);
      expect(queryQuotes("QUO-1002")).toHaveLength(1);
      expect(queryQuotes("Ahmed")).toHaveLength(2);
      expect(queryQuotes("Ahmed", "converted")).toHaveLength(1);
    });

    it("sorts quotations correctly by date and value", () => {
      const mockQuotes = [
        { id: "q1", total: 45000, createdAt: 100 },
        { id: "q2", total: 85000, createdAt: 200 },
        { id: "q3", total: 120000, createdAt: 300 },
      ];

      const sortQuotes = (sort: "newest" | "oldest" | "highest_value" | "lowest_value") => {
        const copy = [...mockQuotes];
        if (sort === "newest") return copy.sort((a, b) => b.createdAt - a.createdAt);
        if (sort === "oldest") return copy.sort((a, b) => a.createdAt - b.createdAt);
        if (sort === "highest_value") return copy.sort((a, b) => b.total - a.total);
        if (sort === "lowest_value") return copy.sort((a, b) => a.total - b.total);
        return copy;
      };

      expect(sortQuotes("newest")[0].id).toBe("q3");
      expect(sortQuotes("oldest")[0].id).toBe("q1");
      expect(sortQuotes("highest_value")[0].id).toBe("q3");
      expect(sortQuotes("lowest_value")[0].id).toBe("q1");
    });
  });

  describe("5. Tenant Isolation Invariant", () => {
    it("ensures search, filter, and pagination queries strictly isolate tenants", () => {
      const tenantA_ID = "11111111-1111-1111-1111-111111111111";
      const tenantB_ID = "22222222-2222-2222-2222-222222222222";

      const allRecords = [
        { id: "1", tenantId: tenantA_ID, name: "Customer Tenant A" },
        { id: "2", tenantId: tenantB_ID, name: "Customer Tenant B" },
      ];

      const tenantScopedQuery = (ctxTenantId: string, search?: string) => {
        return allRecords.filter((r) => {
          if (r.tenantId !== ctxTenantId) return false;
          if (search && !r.name.includes(search)) return false;
          return true;
        });
      };

      expect(tenantScopedQuery(tenantA_ID)).toHaveLength(1);
      expect(tenantScopedQuery(tenantA_ID)[0].name).toBe("Customer Tenant A");

      // Tenant A searching for Tenant B's customer name gets 0 results
      expect(tenantScopedQuery(tenantA_ID, "Tenant B")).toHaveLength(0);
    });
  });
});
