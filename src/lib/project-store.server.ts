import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, or, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client.server";
import { projects, customers, orders, quotes, appUsers, opportunities } from "@/db/schema";

export interface ProjectEntityRecord {
  id: string;
  projectNumber: string;
  customerId: string;
  quoteId: string | null;
  orderId: string | null;
  opportunityId: string | null;
  title: string;
  projectType: string;
  status: string;
  currentStage: string;
  totalValue: string | number;
  salesOwner: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
}

const FALLBACK_FILE = path.resolve(process.cwd(), ".data", "projects-fallback.json");

let memoryStore: ProjectEntityRecord[] | null = null;

function loadFallbackStore(): ProjectEntityRecord[] {
  if (memoryStore !== null) {
    return memoryStore;
  }
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const content = fs.readFileSync(FALLBACK_FILE, "utf-8");
      memoryStore = JSON.parse(content);
      return memoryStore!;
    }
  } catch (err) {
    console.warn("Failed to read projects fallback file, using memory store:", err);
  }
  memoryStore = [];
  return memoryStore;
}

function saveFallbackStore(records: ProjectEntityRecord[]): void {
  memoryStore = records;
  try {
    const dir = path.dirname(FALLBACK_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to persist projects fallback store:", err);
  }
}

function hasDatabaseConfig(): boolean {
  return !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
}

let hasProjectsTableInDb: boolean | null = null;

function isMissingRelationError(err: any): boolean {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  const msg = `${err.message || ""} ${err.cause?.message || ""}`;
  return code === "42P01" || code === "42703" || msg.includes("does not exist");
}

/**
 * Find project by its primary ID (or fallback legacy ID)
 */
export async function findProjectById(
  tenantId: string,
  projectId: string,
): Promise<ProjectEntityRecord | null> {
  // 1. Try querying Postgres projects table
  if (hasDatabaseConfig() && hasProjectsTableInDb !== false) {
    try {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
        .limit(1);

      if (row) {
        return {
          ...row,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        };
      }
    } catch (err: any) {
      if (isMissingRelationError(err)) {
        hasProjectsTableInDb = false;
      } else {
        throw err;
      }
    }
  }

  // 2. Query fallback store by ID
  const store = loadFallbackStore();
  const matched = store.find((p) => p.tenantId === tenantId && p.id === projectId);
  if (matched) return matched;

  // 3. Graceful fallback for legacy links: check if projectId is an orderId
  const legacyOrderMatch = store.find(
    (p) => p.tenantId === tenantId && p.orderId === projectId,
  );
  if (legacyOrderMatch) return legacyOrderMatch;

  // 4. Check if projectId matches an existing converted order in Postgres
  try {
    const [ord] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, projectId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (ord && ord.quoteId) {
      return await createProjectRecord({
        tenantId,
        customerId: ord.customerId,
        quoteId: ord.quoteId,
        orderId: ord.id,
        title: `مشروع أمر الإنتاج ${ord.orderNumber}`,
        totalValue: ord.total,
        customProjectNumber: `PRJ-${ord.orderNumber.replace(/^(ORD|PLC)-/, "")}`,
      });
    }
  } catch {
    // Non-blocking
  }

  return null;
}

/**
 * Find project linked to a quotation or order
 */
export async function findProjectByQuoteOrOrder(
  tenantId: string,
  quoteId?: string | null,
  orderId?: string | null,
): Promise<ProjectEntityRecord | null> {
  if (!quoteId && !orderId) return null;

  // 1. Try querying Postgres projects table
  if (hasDatabaseConfig() && hasProjectsTableInDb !== false) {
    try {
      const matchConditions = [];
      if (quoteId) matchConditions.push(eq(projects.quoteId, quoteId));
      if (orderId) matchConditions.push(eq(projects.orderId, orderId));

      if (matchConditions.length > 0) {
        const [row] = await db
          .select()
          .from(projects)
          .where(and(eq(projects.tenantId, tenantId), or(...matchConditions)))
          .limit(1);

        if (row) {
          return {
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
          };
        }
      }
    } catch (err: any) {
      if (isMissingRelationError(err)) {
        hasProjectsTableInDb = false;
      } else {
        throw err;
      }
    }
  }

  // 2. Query fallback store
  const store = loadFallbackStore();
  const matched = store.find(
    (p) =>
      p.tenantId === tenantId &&
      ((quoteId && p.quoteId === quoteId) || (orderId && p.orderId === orderId)),
  );
  if (matched) return matched;

  // 3. Check if there is an existing converted order in PostgreSQL for this quote
  if (quoteId || orderId) {
    try {
      const orderConditions = [eq(orders.tenantId, tenantId)];
      if (orderId) orderConditions.push(eq(orders.id, orderId));
      if (quoteId) orderConditions.push(eq(orders.quoteId, quoteId));

      const [ord] = await db
        .select()
        .from(orders)
        .where(and(...orderConditions))
        .limit(1);

      if (ord && ord.quoteId) {
        return await createProjectRecord({
          tenantId,
          customerId: ord.customerId,
          quoteId: ord.quoteId,
          orderId: ord.id,
          title: `مشروع أمر الإنتاج ${ord.orderNumber}`,
          totalValue: ord.total,
          customProjectNumber: `PRJ-${ord.orderNumber.replace(/^(ORD|PLC)-/, "")}`,
        });
      }
    } catch {
      // Non-blocking
    }
  }

  return null;
}

/**
 * Batch lookup projects linked to quotes or orders in a single query.
 * Eliminates N+1 query loop when rendering lists of quotations or orders.
 */
export async function findProjectsByQuoteOrOrderBatch(
  tenantId: string,
  quoteIds: string[],
  orderIds: string[],
): Promise<{
  byQuoteId: Map<string, ProjectEntityRecord>;
  byOrderId: Map<string, ProjectEntityRecord>;
}> {
  const byQuoteId = new Map<string, ProjectEntityRecord>();
  const byOrderId = new Map<string, ProjectEntityRecord>();

  const validQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
  const validOrderIds = Array.from(new Set(orderIds.filter(Boolean)));

  if (validQuoteIds.length === 0 && validOrderIds.length === 0) {
    return { byQuoteId, byOrderId };
  }

  if (hasDatabaseConfig() && hasProjectsTableInDb !== false) {
    try {
      const matchConditions = [];
      if (validQuoteIds.length > 0) {
        matchConditions.push(inArray(projects.quoteId, validQuoteIds));
      }
      if (validOrderIds.length > 0) {
        matchConditions.push(inArray(projects.orderId, validOrderIds));
      }

      if (matchConditions.length > 0) {
        const rows = await db
          .select()
          .from(projects)
          .where(and(eq(projects.tenantId, tenantId), or(...matchConditions)));

        for (const row of rows) {
          const rec: ProjectEntityRecord = {
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
          };
          if (row.quoteId) byQuoteId.set(row.quoteId, rec);
          if (row.orderId) byOrderId.set(row.orderId, rec);
        }
      }
    } catch (err: any) {
      if (isMissingRelationError(err)) {
        hasProjectsTableInDb = false;
      }
    }
  }

  // Fallback memory store lookup for any missing
  const store = loadFallbackStore();
  for (const p of store) {
    if (p.tenantId !== tenantId) continue;
    if (p.quoteId && validQuoteIds.includes(p.quoteId) && !byQuoteId.has(p.quoteId)) {
      byQuoteId.set(p.quoteId, p);
    }
    if (p.orderId && validOrderIds.includes(p.orderId) && !byOrderId.has(p.orderId)) {
      byOrderId.set(p.orderId, p);
    }
  }

  return { byQuoteId, byOrderId };
}

/**
 * List all projects with filtering and pagination
 */
export async function listProjectRecords(
  tenantId: string,
  opts?: {
    searchTerm?: string;
    stageFilter?: string;
    projectTypeFilter?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: ProjectEntityRecord[]; totalCount: number }> {
  const limit = opts?.limit ?? 25;
  const offset = opts?.offset ?? 0;

  // 1. Try Postgres projects table
  if (hasDatabaseConfig() && hasProjectsTableInDb !== false) {
    try {
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(projects.createdAt))
        .limit(500);

      let mapped: ProjectEntityRecord[] = (rows || []).map((r) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      }));

      if (opts?.searchTerm) {
        const q = opts.searchTerm.toLowerCase();
        mapped = mapped.filter(
          (p) =>
            p.projectNumber.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q),
        );
      }
      if (opts?.stageFilter && opts.stageFilter !== "all") {
        mapped = mapped.filter((p) => p.currentStage === opts.stageFilter);
      }
      if (opts?.projectTypeFilter && opts.projectTypeFilter !== "all") {
        mapped = mapped.filter((p) => p.projectType === opts.projectTypeFilter);
      }

      const totalCount = mapped.length;
      const paginated = mapped.slice(offset, offset + limit);
      return { rows: paginated, totalCount };
    } catch (err: any) {
      if (isMissingRelationError(err)) {
        hasProjectsTableInDb = false;
      } else {
        throw err;
      }
    }
  }

  // 2. Query fallback store
  const store = loadFallbackStore();
  let filtered = store.filter((p) => p.tenantId === tenantId);

  // If fallback store is empty, sync from existing converted orders
  if (filtered.length === 0) {
    try {
      const existingOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.tenantId, tenantId))
        .orderBy(desc(orders.createdAt))
        .limit(50);

      for (const ord of existingOrders) {
        if (ord.quoteId) {
          const rec: ProjectEntityRecord = {
            id: crypto.randomUUID(),
            projectNumber: `PRJ-${ord.orderNumber.replace(/^(ORD|PLC)-/, "")}`,
            customerId: ord.customerId,
            quoteId: ord.quoteId,
            orderId: ord.id,
            opportunityId: null,
            title: `مشروع أمر الإنتاج ${ord.orderNumber}`,
            projectType: "residential",
            status: ord.currentStage === "delivered" || ord.currentStage === "completed" ? "completed" : "active",
            currentStage: ord.currentStage === "completed" ? "completed" : "production",
            totalValue: String(ord.total || 0),
            salesOwner: null,
            notes: null,
            createdAt: ord.createdAt ? new Date(ord.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: ord.createdAt ? new Date(ord.createdAt).toISOString() : new Date().toISOString(),
            tenantId,
          };
          filtered.push(rec);
        }
      }
      if (filtered.length > 0) {
        saveFallbackStore([...store, ...filtered]);
      }
    } catch {
      // Non-blocking
    }
  }

  if (opts?.searchTerm) {
    const q = opts.searchTerm.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.projectNumber.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q),
    );
  }
  if (opts?.stageFilter && opts.stageFilter !== "all") {
    filtered = filtered.filter((p) => p.currentStage === opts.stageFilter);
  }
  if (opts?.projectTypeFilter && opts.projectTypeFilter !== "all") {
    filtered = filtered.filter((p) => p.projectType === opts.projectTypeFilter);
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCount = filtered.length;
  const rows = filtered.slice(offset, offset + limit);
  return { rows, totalCount };
}

/**
 * Create or idempotently return existing Project record.
 * Must only be called upon quote acceptance/order conversion!
 */
export async function createProjectRecord(params: {
  tenantId: string;
  customerId: string;
  quoteId?: string | null;
  orderId?: string | null;
  opportunityId?: string | null;
  title?: string | null;
  projectType?: string | null;
  totalValue?: string | number;
  salesOwner?: string | null;
  notes?: string | null;
  customProjectNumber?: string;
}): Promise<ProjectEntityRecord> {
  const { tenantId, customerId } = params;

  // Idempotent duplicate check: If a project already exists for this quote or order, return it
  const store = loadFallbackStore();
  const existing = store.find(
    (p) =>
      p.tenantId === tenantId &&
      ((params.quoteId && p.quoteId === params.quoteId) ||
        (params.orderId && p.orderId === params.orderId)),
  );
  if (existing) {
    return existing;
  }

  // Determine Project Number (e.g. PRJ-2026-0001 or based on quote/order number)
  let projNum = params.customProjectNumber;
  if (!projNum) {
    const count = store.filter((p) => p.tenantId === tenantId).length + 1;
    const year = new Date().getFullYear();
    projNum = `PRJ-${year}-${String(count).padStart(4, "0")}`;
  }

  const newRecord: ProjectEntityRecord = {
    id: crypto.randomUUID(),
    projectNumber: projNum,
    customerId,
    quoteId: params.quoteId ?? null,
    orderId: params.orderId ?? null,
    opportunityId: params.opportunityId ?? null,
    title: params.title || `مشروع تصنيع وتوريد ${projNum}`,
    projectType: params.projectType || "residential",
    status: "active",
    currentStage: "production",
    totalValue: String(params.totalValue ?? "0"),
    salesOwner: params.salesOwner ?? null,
    notes: params.notes ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tenantId,
  };

  // 1. Try persisting to Postgres projects table
  if (hasDatabaseConfig() && hasProjectsTableInDb !== false) {
    try {
      const [inserted] = await db
        .insert(projects)
        .values({
          id: newRecord.id,
          projectNumber: newRecord.projectNumber,
          customerId: newRecord.customerId,
          quoteId: newRecord.quoteId,
          orderId: newRecord.orderId,
          opportunityId: newRecord.opportunityId,
          title: newRecord.title,
          projectType: newRecord.projectType,
          status: newRecord.status,
          currentStage: newRecord.currentStage,
          totalValue: String(newRecord.totalValue),
          salesOwner: newRecord.salesOwner,
          notes: newRecord.notes,
          tenantId: newRecord.tenantId,
        })
        .returning();

      if (inserted) {
        newRecord.id = inserted.id;
      }
    } catch (err: any) {
      if (isMissingRelationError(err)) {
        hasProjectsTableInDb = false;
      } else {
        throw err;
      }
    }
  }

  // 2. Always persist into fallback store for preview resilience
  const existingIdx = store.findIndex((p) => p.id === newRecord.id);
  if (existingIdx >= 0) {
    store[existingIdx] = newRecord;
  } else {
    store.push(newRecord);
  }
  saveFallbackStore(store);

  return newRecord;
}
