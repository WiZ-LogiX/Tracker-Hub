import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  leads,
  opportunities,
  customers,
  quotes,
  orders,
  tasks,
  taskAssignees,
  tenantCounters,
  tenantMembers,
  appUsers,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, asc, sql, inArray, or, isNull, lt } from "drizzle-orm";
import type { TenantContext } from "@/lib/tenant-context";
import type {
  LeadItem,
  OpportunityItem,
  OpportunityDetail,
  OpportunityTimelineEvent,
  CRMStats,
  LeadStatus,
  LeadSource,
  ProjectType,
  PipelineStage,
  OpportunityStatus,
  SalespersonWorkload,
  SalesWorkspaceKPIs,
  AttentionItem,
  AttentionReason,
  ActivityType,
  LogActivityInput,
  BulkAssignInput,
} from "@/lib/crm-types";
import { PIPELINE_STAGES, ACTIVITY_TYPES } from "@/lib/crm-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const LeadSourceSchema = z.enum([
  "facebook",
  "instagram",
  "whatsapp",
  "website",
  "referral",
  "walk_in",
  "exhibition",
  "existing_customer",
  "other",
]);

const LeadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "converted",
  "lost",
]);

const ProjectTypeSchema = z.enum([
  "residential",
  "commercial",
  "hospitality",
  "renovation",
  "other",
]);

const PipelineStageSchema = z.enum([
  "new_lead",
  "contacted",
  "qualified",
  "site_visit",
  "design_measurement",
  "quotation",
  "negotiation",
  "won",
  "lost",
]);

const OpportunityStatusSchema = z.enum(["open", "won", "lost", "abandoned"]);

const ListLeadsInput = z
  .object({
    search: z.string().optional(),
    status: z.union([LeadStatusSchema, z.literal("all")]).optional().default("all"),
    source: z.union([LeadSourceSchema, z.literal("all")]).optional().default("all"),
    assignedSalesperson: z.string().optional().default("all"),
    sort: z.enum(["newest", "oldest", "name_asc", "name_desc"]).optional().default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetLeadByIdInput = z.object({
  leadId: z.string().uuid(),
});

const CreateLeadInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  location: z.string().trim().optional().nullable(),
  source: LeadSourceSchema.default("other"),
  interestedProduct: z.string().trim().optional().nullable(),
  estimatedBudget: z.number().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  assignedSalesperson: z.string().uuid().optional().nullable(),
  nextAction: z.string().trim().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
});

const UpdateLeadInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  location: z.string().trim().optional().nullable(),
  source: LeadSourceSchema.optional(),
  interestedProduct: z.string().trim().optional().nullable(),
  estimatedBudget: z.number().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  assignedSalesperson: z.string().uuid().optional().nullable(),
  status: LeadStatusSchema.optional(),
  nextAction: z.string().trim().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
});

const ConvertLeadInputSchema = z.object({
  leadId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  newCustomer: z
    .object({
      name: z.string().trim().min(1, "Customer name is required"),
      phone: z.string().trim().optional().nullable(),
      email: z.string().trim().email().optional().nullable().or(z.literal("")),
      address: z.string().trim().optional().nullable(),
      companyName: z.string().trim().optional().nullable(),
    })
    .optional()
    .nullable(),
  opportunityTitle: z.string().trim().min(1, "Opportunity title is required"),
  projectType: ProjectTypeSchema.default("residential"),
  value: z.number().min(0).default(0),
  salesOwner: z.string().uuid().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  nextAction: z.string().trim().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
  siteAddress: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const ListOpportunitiesInput = z
  .object({
    search: z.string().optional(),
    stage: z.union([PipelineStageSchema, z.literal("all")]).optional().default("all"),
    status: z.union([OpportunityStatusSchema, z.literal("all")]).optional().default("all"),
    salesOwner: z.string().optional().default("all"),
    customerId: z.string().uuid().optional(),
    myOpportunitiesOnly: z.boolean().optional().default(false),
    sort: z
      .enum(["newest", "oldest", "value_desc", "value_asc", "next_action_asc"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
  })
  .optional()
  .default({});

const GetOpportunityByIdInput = z.object({
  opportunityId: z.string().uuid(),
});

const CreateOpportunityInputSchema = z.object({
  customerId: z.string().uuid(),
  leadId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1, "Title is required").max(255),
  projectType: ProjectTypeSchema.default("residential"),
  value: z.number().min(0).default(0),
  salesOwner: z.string().uuid().optional().nullable(),
  stage: PipelineStageSchema.default("new_lead"),
  source: z.string().trim().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  nextAction: z.string().trim().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
  siteAddress: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const UpdateOpportunityInputSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(255).optional(),
    projectType: ProjectTypeSchema.optional(),
    value: z.number().min(0).optional(),
    salesOwner: z.string().uuid().optional().nullable(),
    stage: PipelineStageSchema.optional(),
    source: z.string().trim().optional().nullable(),
    expectedCloseDate: z.string().optional().nullable(),
    nextAction: z.string().trim().optional().nullable(),
    nextActionDate: z.string().optional().nullable(),
    siteAddress: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    status: OpportunityStatusSchema.optional(),
    lostReason: z.string().trim().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.stage === "lost" && (!d.lostReason || d.lostReason.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: "A lost reason is required when marking an opportunity as lost",
      path: ["lostReason"],
    },
  );

const ChangeOpportunityStageInput = z
  .object({
    opportunityId: z.string().uuid(),
    stage: PipelineStageSchema,
    lostReason: z.string().trim().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.stage === "lost" && (!d.lostReason || d.lostReason.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: "A lost reason is required when marking an opportunity as lost",
      path: ["lostReason"],
    },
  );

const CreateOpportunityTaskInput = z.object({
  opportunityId: z.string().uuid(),
  title: z.string().trim().min(1, "Task title is required"),
  description: z.string().trim().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
});

// ── Private Concurrency & Atomic Numbering Helpers ──────────────────────────

/**
 * Atomically generates the next sequential lead number (LED-XXXX) per tenant.
 */
async function getNextLeadCode(tenantId: string): Promise<string> {
  const [row] = await db
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "lead",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const nextVal = row?.lastValue ?? 1001;
  return `LED-${nextVal}`;
}

/**
 * Atomically generates the next sequential opportunity number (OPP-XXXX) per tenant.
 */
async function getNextOpportunityCode(tenantId: string): Promise<string> {
  const [row] = await db
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "opportunity",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const nextVal = row?.lastValue ?? 1001;
  return `OPP-${nextVal}`;
}

/**
 * Atomically generates the next sequential task code (TSK-XXXX) per tenant.
 */
async function getNextTaskCode(tenantId: string): Promise<string> {
  const [row] = await db
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "task",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const nextVal = row?.lastValue ?? 1001;
  return `TSK-${nextVal}`;
}

/**
 * Normalize phone numbers to clean digits for deduplication.
 * Strips formatting, international prefixes (+20, 0020), and local zero.
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(4);
  else if (digits.startsWith("20") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length > 9) digits = digits.slice(1);
  return digits.length > 0 ? digits : null;
}

/**
 * Normalize email for deduplication.
 */
function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List paginated leads with filtering and search.
 */
export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListLeadsInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{
    rows: LeadItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to CRM");
    }

    try {
      const conditions = [eq(leads.tenantId, tenantId)];

      if (data.search && data.search.trim().length > 0) {
        const q = `%${data.search.trim()}%`;
        conditions.push(
          sql`(${leads.leadNumber} ILIKE ${q} OR ${leads.name} ILIKE ${q} OR ${leads.phone} ILIKE ${q} OR ${leads.email} ILIKE ${q} OR ${leads.location} ILIKE ${q} OR ${leads.notes} ILIKE ${q})`,
        );
      }

      if (data.status && data.status !== "all") {
        conditions.push(eq(leads.status, data.status));
      }

      if (data.source && data.source !== "all") {
        conditions.push(eq(leads.source, data.source));
      }

      if (data.assignedSalesperson && data.assignedSalesperson !== "all") {
        conditions.push(eq(leads.assignedSalesperson, data.assignedSalesperson));
      }

      const whereClause = and(...conditions);

      // Count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(whereClause);

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / data.pageSize) || 1;
      const offset = (data.page - 1) * data.pageSize;

      // Order by
      let orderByClause = desc(leads.createdAt);
      if (data.sort === "oldest") orderByClause = asc(leads.createdAt);
      else if (data.sort === "name_asc") orderByClause = asc(leads.name);
      else if (data.sort === "name_desc") orderByClause = desc(leads.name);

      const rows = await db
        .select({
          id: leads.id,
          tenantId: leads.tenantId,
          leadNumber: leads.leadNumber,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          location: leads.location,
          source: leads.source,
          interestedProduct: leads.interestedProduct,
          estimatedBudget: leads.estimatedBudget,
          notes: leads.notes,
          assignedSalesperson: leads.assignedSalesperson,
          status: leads.status,
          nextAction: leads.nextAction,
          nextActionDate: leads.nextActionDate,
          convertedCustomerId: leads.convertedCustomerId,
          convertedOpportunityId: leads.convertedOpportunityId,
          convertedAt: leads.convertedAt,
          createdAt: leads.createdAt,
          updatedAt: leads.updatedAt,
          assignedSalespersonName: appUsers.displayName,
          convertedCustomerName: customers.name,
        })
        .from(leads)
        .leftJoin(appUsers, eq(leads.assignedSalesperson, appUsers.id))
        .leftJoin(customers, eq(leads.convertedCustomerId, customers.id))
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(data.pageSize)
        .offset(offset);

      const formattedRows: LeadItem[] = rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        leadNumber: r.leadNumber,
        name: r.name,
        phone: r.phone,
        email: r.email,
        location: r.location,
        source: r.source as LeadSource,
        interestedProduct: r.interestedProduct,
        estimatedBudget: r.estimatedBudget ? Number(r.estimatedBudget) : null,
        notes: r.notes,
        assignedSalesperson: r.assignedSalesperson,
        assignedSalespersonName: r.assignedSalespersonName ?? null,
        status: r.status as LeadStatus,
        nextAction: r.nextAction,
        nextActionDate: r.nextActionDate ? r.nextActionDate.toISOString() : null,
        convertedCustomerId: r.convertedCustomerId,
        convertedCustomerName: r.convertedCustomerName ?? null,
        convertedOpportunityId: r.convertedOpportunityId,
        convertedOpportunityNumber: null,
        convertedAt: r.convertedAt ? r.convertedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));

      return {
        rows: formattedRows,
        totalCount,
        page: data.page,
        pageSize: data.pageSize,
        totalPages,
      };
    } catch (err: any) {
      // Resilient backward-compatibility if table does not exist
      if (err?.code === "42P01" || err?.message?.includes("does not exist")) {
        return {
          rows: [],
          totalCount: 0,
          page: 1,
          pageSize: data.pageSize,
          totalPages: 1,
        };
      }
      throw err;
    }
  });

/**
 * Get single lead by ID with enriched details.
 */
export const getLeadById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetLeadByIdInput.parse(input))
  .handler(async ({ data, context }): Promise<LeadItem | null> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to CRM");
    }

    try {
      const [r] = await db
        .select({
          id: leads.id,
          tenantId: leads.tenantId,
          leadNumber: leads.leadNumber,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          location: leads.location,
          source: leads.source,
          interestedProduct: leads.interestedProduct,
          estimatedBudget: leads.estimatedBudget,
          notes: leads.notes,
          assignedSalesperson: leads.assignedSalesperson,
          status: leads.status,
          nextAction: leads.nextAction,
          nextActionDate: leads.nextActionDate,
          convertedCustomerId: leads.convertedCustomerId,
          convertedOpportunityId: leads.convertedOpportunityId,
          convertedAt: leads.convertedAt,
          createdAt: leads.createdAt,
          updatedAt: leads.updatedAt,
          assignedSalespersonName: appUsers.displayName,
          convertedCustomerName: customers.name,
        })
        .from(leads)
        .leftJoin(appUsers, eq(leads.assignedSalesperson, appUsers.id))
        .leftJoin(customers, eq(leads.convertedCustomerId, customers.id))
        .where(and(eq(leads.id, data.leadId), eq(leads.tenantId, tenantId)));

      if (!r) return null;

      return {
        id: r.id,
        tenantId: r.tenantId,
        leadNumber: r.leadNumber,
        name: r.name,
        phone: r.phone,
        email: r.email,
        location: r.location,
        source: r.source as LeadSource,
        interestedProduct: r.interestedProduct,
        estimatedBudget: r.estimatedBudget ? Number(r.estimatedBudget) : null,
        notes: r.notes,
        assignedSalesperson: r.assignedSalesperson,
        assignedSalespersonName: r.assignedSalespersonName ?? null,
        status: r.status as LeadStatus,
        nextAction: r.nextAction,
        nextActionDate: r.nextActionDate ? r.nextActionDate.toISOString() : null,
        convertedCustomerId: r.convertedCustomerId,
        convertedCustomerName: r.convertedCustomerName ?? null,
        convertedOpportunityId: r.convertedOpportunityId,
        convertedOpportunityNumber: null,
        convertedAt: r.convertedAt ? r.convertedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    } catch (err: any) {
      if (err?.code === "42P01") return null;
      throw err;
    }
  });

/**
 * Create a new lead with atomic LED-XXXX numbering.
 */
export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateLeadInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LeadItem> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to create leads");
    }

    const leadNumber = await getNextLeadCode(tenantId);

    const [inserted] = await db
      .insert(leads)
      .values({
        tenantId,
        leadNumber,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        location: data.location || null,
        source: data.source || "other",
        interestedProduct: data.interestedProduct || null,
        estimatedBudget: data.estimatedBudget ? String(data.estimatedBudget) : null,
        notes: data.notes || null,
        assignedSalesperson: data.assignedSalesperson || (role === "sales" ? userId : null),
        status: "new",
        nextAction: data.nextAction || null,
        nextActionDate: data.nextActionDate ? new Date(data.nextActionDate) : null,
      })
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "lead",
      entityId: inserted.id,
      action: "lead_created",
      details: {
        leadNumber: inserted.leadNumber,
        name: inserted.name,
        source: inserted.source,
      },
    });

    return {
      id: inserted.id,
      tenantId: inserted.tenantId,
      leadNumber: inserted.leadNumber,
      name: inserted.name,
      phone: inserted.phone,
      email: inserted.email,
      location: inserted.location,
      source: inserted.source as LeadSource,
      interestedProduct: inserted.interestedProduct,
      estimatedBudget: inserted.estimatedBudget ? Number(inserted.estimatedBudget) : null,
      notes: inserted.notes,
      assignedSalesperson: inserted.assignedSalesperson,
      status: inserted.status as LeadStatus,
      nextAction: inserted.nextAction,
      nextActionDate: inserted.nextActionDate ? inserted.nextActionDate.toISOString() : null,
      convertedCustomerId: null,
      convertedOpportunityId: null,
      convertedAt: null,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  });

/**
 * Update an existing lead.
 */
export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateLeadInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LeadItem> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to update leads");
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.location !== undefined) updatePayload.location = data.location;
    if (data.source !== undefined) updatePayload.source = data.source;
    if (data.interestedProduct !== undefined) updatePayload.interestedProduct = data.interestedProduct;
    if (data.estimatedBudget !== undefined) {
      updatePayload.estimatedBudget = data.estimatedBudget ? String(data.estimatedBudget) : null;
    }
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.assignedSalesperson !== undefined) updatePayload.assignedSalesperson = data.assignedSalesperson;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.nextAction !== undefined) updatePayload.nextAction = data.nextAction;
    if (data.nextActionDate !== undefined) {
      updatePayload.nextActionDate = data.nextActionDate ? new Date(data.nextActionDate) : null;
    }

    const [updated] = await db
      .update(leads)
      .set(updatePayload)
      .where(and(eq(leads.id, data.id), eq(leads.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new Error("Lead not found or unauthorized");
    }

    // Audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "lead",
      entityId: updated.id,
      action: "lead_updated",
      details: updatePayload,
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      leadNumber: updated.leadNumber,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      location: updated.location,
      source: updated.source as LeadSource,
      interestedProduct: updated.interestedProduct,
      estimatedBudget: updated.estimatedBudget ? Number(updated.estimatedBudget) : null,
      notes: updated.notes,
      assignedSalesperson: updated.assignedSalesperson,
      status: updated.status as LeadStatus,
      nextAction: updated.nextAction,
      nextActionDate: updated.nextActionDate ? updated.nextActionDate.toISOString() : null,
      convertedCustomerId: updated.convertedCustomerId,
      convertedOpportunityId: updated.convertedOpportunityId,
      convertedAt: updated.convertedAt ? updated.convertedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });

/**
 * Convert a Lead into a Customer + Opportunity.
 * Detects potential duplicate customers by phone or email; reuses existing customer if present.
 * Creates an Opportunity linked to the customer and lead.
 * Updates the lead status to "converted".
 */
export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ConvertLeadInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{
    success: boolean;
    customerId: string;
    customerName: string;
    isExistingCustomer: boolean;
    opportunityId: string;
    opportunityNumber: string;
  }> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to convert leads");
    }

    // 1. Fetch Lead
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, data.leadId), eq(leads.tenantId, tenantId)));

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status === "converted") {
      throw new Error("This lead has already been converted");
    }

    let targetCustomerId: string | null = data.customerId || null;
    let targetCustomerName = "";
    let isExistingCustomer = false;

    // 2. Customer resolution & duplicate prevention
    if (targetCustomerId) {
      // Explicit customer selection
      const [existingCust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, targetCustomerId), eq(customers.tenantId, tenantId)));

      if (!existingCust) {
        throw new Error("Selected customer not found");
      }
      targetCustomerName = existingCust.name;
      isExistingCustomer = true;
    } else {
      // Determine candidate customer fields from newCustomer or fallback to lead info
      const candidateName = data.newCustomer?.name?.trim() || lead.name;
      const candidatePhone = data.newCustomer?.phone?.trim() || lead.phone || null;
      const candidateEmail = data.newCustomer?.email?.trim() || lead.email || null;
      const candidateAddress = data.newCustomer?.address?.trim() || lead.location || null;

      const normPhone = normalizePhone(candidatePhone);
      const normEmail = normalizeEmail(candidateEmail);

      // Search for duplicate customer within tenant by phone or email
      let matchedCustomer = null;
      if (normPhone || normEmail) {
        const queryConds = [];
        if (normPhone) {
          queryConds.push(sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${normPhone}`);
        }
        if (normEmail) {
          queryConds.push(sql`LOWER(TRIM(${customers.email})) = ${normEmail}`);
        }

        const [found] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), or(...queryConds)))
          .limit(1);

        matchedCustomer = found;
      }

      if (matchedCustomer) {
        // Reuse existing customer!
        targetCustomerId = matchedCustomer.id;
        targetCustomerName = matchedCustomer.name;
        isExistingCustomer = true;
      } else {
        // Create new customer
        const [newCust] = await db
          .insert(customers)
          .values({
            tenantId,
            name: candidateName,
            phone: candidatePhone,
            email: candidateEmail,
            address: candidateAddress,
          })
          .returning();

        targetCustomerId = newCust.id;
        targetCustomerName = newCust.name;
        isExistingCustomer = false;

        // Audit log for customer creation
        await db.insert(auditLog).values({
          tenantId,
          actorId: userId,
          entityType: "customer",
          entityId: newCust.id,
          action: "customer_created_from_lead",
          details: {
            leadId: lead.id,
            leadNumber: lead.leadNumber,
            name: newCust.name,
          },
        });
      }
    }

    // 3. Create Opportunity
    const opportunityNumber = await getNextOpportunityCode(tenantId);
    const assignedSalesOwner = data.salesOwner || lead.assignedSalesperson || (role === "sales" ? userId : null);

    const [opp] = await db
      .insert(opportunities)
      .values({
        tenantId,
        opportunityNumber,
        customerId: targetCustomerId,
        leadId: lead.id,
        title: data.opportunityTitle,
        projectType: data.projectType || "residential",
        value: String(data.value || lead.estimatedBudget || 0),
        salesOwner: assignedSalesOwner,
        stage: "new_lead",
        source: lead.source,
        expectedCloseDate: data.expectedCloseDate || null,
        nextAction: data.nextAction || lead.nextAction || null,
        nextActionDate: data.nextActionDate
          ? new Date(data.nextActionDate)
          : lead.nextActionDate || null,
        siteAddress: data.siteAddress || lead.location || null,
        notes: data.notes || lead.notes || null,
        status: "open",
      })
      .returning();

    // 4. Update Lead to Converted
    await db
      .update(leads)
      .set({
        status: "converted",
        convertedCustomerId: targetCustomerId,
        convertedOpportunityId: opp.id,
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));

    // 5. Audit Log for Lead & Opportunity
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "lead",
      entityId: lead.id,
      action: "lead_converted",
      details: {
        customerId: targetCustomerId,
        customerName: targetCustomerName,
        opportunityId: opp.id,
        opportunityNumber: opp.opportunityNumber,
      },
    });

    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "opportunity",
      entityId: opp.id,
      action: "opportunity_created_from_lead",
      details: {
        leadId: lead.id,
        leadNumber: lead.leadNumber,
        customerId: targetCustomerId,
        title: opp.title,
        value: opp.value,
      },
    });

    return {
      success: true,
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      isExistingCustomer,
      opportunityId: opp.id,
      opportunityNumber: opp.opportunityNumber,
    };
  });

/**
 * List opportunities with filtering, pipeline stage grouping, and next action status.
 */
export const listOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListOpportunitiesInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{
    rows: OpportunityItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to CRM");
    }

    try {
      const conditions = [eq(opportunities.tenantId, tenantId)];

      if (data.search && data.search.trim().length > 0) {
        const q = `%${data.search.trim()}%`;
        conditions.push(
          sql`(${opportunities.opportunityNumber} ILIKE ${q} OR ${opportunities.title} ILIKE ${q} OR ${opportunities.notes} ILIKE ${q} OR ${opportunities.siteAddress} ILIKE ${q})`,
        );
      }

      if (data.stage && data.stage !== "all") {
        conditions.push(eq(opportunities.stage, data.stage));
      }

      if (data.status && data.status !== "all") {
        conditions.push(eq(opportunities.status, data.status));
      }

      if (data.customerId) {
        conditions.push(eq(opportunities.customerId, data.customerId));
      }

      if (data.myOpportunitiesOnly || (role === "sales" && data.salesOwner === "me")) {
        conditions.push(eq(opportunities.salesOwner, userId));
      } else if (data.salesOwner && data.salesOwner !== "all") {
        conditions.push(eq(opportunities.salesOwner, data.salesOwner));
      }

      const whereClause = and(...conditions);

      // Count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(whereClause);

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / data.pageSize) || 1;
      const offset = (data.page - 1) * data.pageSize;

      // Order by
      let orderByClause = desc(opportunities.createdAt);
      if (data.sort === "oldest") orderByClause = asc(opportunities.createdAt);
      else if (data.sort === "value_desc") orderByClause = desc(opportunities.value);
      else if (data.sort === "value_asc") orderByClause = asc(opportunities.value);
      else if (data.sort === "next_action_asc") orderByClause = asc(opportunities.nextActionDate);

      const rows = await db
        .select({
          id: opportunities.id,
          tenantId: opportunities.tenantId,
          opportunityNumber: opportunities.opportunityNumber,
          customerId: opportunities.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          leadId: opportunities.leadId,
          leadNumber: leads.leadNumber,
          title: opportunities.title,
          projectType: opportunities.projectType,
          value: opportunities.value,
          salesOwner: opportunities.salesOwner,
          salesOwnerName: appUsers.displayName,
          stage: opportunities.stage,
          source: opportunities.source,
          expectedCloseDate: opportunities.expectedCloseDate,
          nextAction: opportunities.nextAction,
          nextActionDate: opportunities.nextActionDate,
          siteAddress: opportunities.siteAddress,
          notes: opportunities.notes,
          status: opportunities.status,
          lostReason: opportunities.lostReason,
          createdAt: opportunities.createdAt,
          updatedAt: opportunities.updatedAt,
        })
        .from(opportunities)
        .leftJoin(customers, eq(opportunities.customerId, customers.id))
        .leftJoin(leads, eq(opportunities.leadId, leads.id))
        .leftJoin(appUsers, eq(opportunities.salesOwner, appUsers.id))
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(data.pageSize)
        .offset(offset);

      const opportunityIds = rows.map((r) => r.id);

      // Optional batch quotes and tasks counts
      const quotesCountMap: Record<string, { count: number; total: number }> = {};
      const tasksCountMap: Record<string, { count: number; open: number }> = {};

      if (opportunityIds.length > 0) {
        try {
          const oppIdSql = sql<string>`(${quotes.snapshot}->>'opportunityId')`;
          const quoteStats = await db
            .select({
              opportunityId: oppIdSql.as("opportunity_id"),
              count: sql<number>`count(*)::int`,
              total: sql<number>`coalesce(sum(${quotes.total}), 0)::numeric`,
            })
            .from(quotes)
            .where(
              and(
                eq(quotes.tenantId, tenantId),
                inArray(oppIdSql, opportunityIds),
              ),
            )
            .groupBy(oppIdSql);

          for (const qs of quoteStats) {
            if (qs.opportunityId) {
              quotesCountMap[qs.opportunityId] = {
                count: Number(qs.count || 0),
                total: Number(qs.total || 0),
              };
            }
          }
        } catch {
          // Backward compatibility if quotes.opportunity_id not present yet
        }

        try {
          const taskStats = await db
            .select({
              opportunityId: tasks.opportunityId,
              count: sql<number>`count(*)::int`,
              openCount: sql<number>`count(case when ${tasks.status} not in ('completed', 'cancelled') then 1 end)::int`,
            })
            .from(tasks)
            .where(
              and(
                eq(tasks.tenantId, tenantId),
                inArray(tasks.opportunityId, opportunityIds),
              ),
            )
            .groupBy(tasks.opportunityId);

          for (const ts of taskStats) {
            if (ts.opportunityId) {
              tasksCountMap[ts.opportunityId] = {
                count: Number(ts.count || 0),
                open: Number(ts.openCount || 0),
              };
            }
          }
        } catch {
          // Backward compatibility if tasks.opportunity_id not present yet
        }
      }

      const formattedRows: OpportunityItem[] = rows.map((r) => {
        const qStat = quotesCountMap[r.id] || { count: 0, total: 0 };
        const tStat = tasksCountMap[r.id] || { count: 0, open: 0 };

        return {
          id: r.id,
          tenantId: r.tenantId,
          opportunityNumber: r.opportunityNumber,
          customerId: r.customerId,
          customerName: r.customerName ?? null,
          customerPhone: r.customerPhone ?? null,
          customerEmail: r.customerEmail ?? null,
          leadId: r.leadId,
          leadNumber: r.leadNumber ?? null,
          title: r.title,
          projectType: r.projectType as ProjectType,
          value: Number(r.value || 0),
          salesOwner: r.salesOwner,
          salesOwnerName: r.salesOwnerName ?? null,
          stage: r.stage as PipelineStage,
          source: r.source,
          expectedCloseDate: r.expectedCloseDate,
          nextAction: r.nextAction,
          nextActionDate: r.nextActionDate ? r.nextActionDate.toISOString() : null,
          siteAddress: r.siteAddress,
          notes: r.notes,
          status: r.status as OpportunityStatus,
          lostReason: r.lostReason,
          quotesCount: qStat.count,
          totalQuotesValue: qStat.total,
          tasksCount: tStat.count,
          openTasksCount: tStat.open,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      });

      return {
        rows: formattedRows,
        totalCount,
        page: data.page,
        pageSize: data.pageSize,
        totalPages,
      };
    } catch (err: any) {
      if (err?.code === "42P01") {
        return {
          rows: [],
          totalCount: 0,
          page: 1,
          pageSize: data.pageSize,
          totalPages: 1,
        };
      }
      throw err;
    }
  });

/**
 * Get Opportunity detail with customer, linked quotes, tasks, orders, and timeline.
 */
export const getOpportunityById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetOpportunityByIdInput.parse(input))
  .handler(async ({ data, context }): Promise<OpportunityDetail | null> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to CRM");
    }

    try {
      const [opp] = await db
        .select({
          id: opportunities.id,
          tenantId: opportunities.tenantId,
          opportunityNumber: opportunities.opportunityNumber,
          customerId: opportunities.customerId,
          customerName: customers.name,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          customerAddress: customers.address,
          leadId: opportunities.leadId,
          leadNumber: leads.leadNumber,
          title: opportunities.title,
          projectType: opportunities.projectType,
          value: opportunities.value,
          salesOwner: opportunities.salesOwner,
          salesOwnerName: appUsers.displayName,
          stage: opportunities.stage,
          source: opportunities.source,
          expectedCloseDate: opportunities.expectedCloseDate,
          nextAction: opportunities.nextAction,
          nextActionDate: opportunities.nextActionDate,
          siteAddress: opportunities.siteAddress,
          notes: opportunities.notes,
          status: opportunities.status,
          lostReason: opportunities.lostReason,
          createdAt: opportunities.createdAt,
          updatedAt: opportunities.updatedAt,
        })
        .from(opportunities)
        .leftJoin(customers, eq(opportunities.customerId, customers.id))
        .leftJoin(leads, eq(opportunities.leadId, leads.id))
        .leftJoin(appUsers, eq(opportunities.salesOwner, appUsers.id))
        .where(and(eq(opportunities.id, data.opportunityId), eq(opportunities.tenantId, tenantId)));

      if (!opp) return null;

      // 1. Linked quotes (strictly prioritize quotes assigned to this opportunity/project)
      let linkedQuotes: Array<{
        id: string;
        quoteNumber: string;
        title: string;
        status: string;
        totalAmount: number;
        createdAt: string;
      }> = [];

      try {
        let qRows = await db
          .select({
            id: quotes.id,
            quoteNumber: quotes.quoteNumber,
            notes: quotes.notes,
            status: quotes.status,
            total: quotes.total,
            createdAt: quotes.createdAt,
          })
          .from(quotes)
          .where(
            and(
              eq(quotes.tenantId, tenantId),
              sql`(${quotes.snapshot}->>'opportunityId') = ${opp.id}`,
            ),
          )
          .orderBy(desc(quotes.createdAt))
          .limit(20);

        // Fallback to unassigned legacy quotes for this customer only if none are assigned to this project
        if (qRows.length === 0 && opp.customerId) {
          qRows = await db
            .select({
              id: quotes.id,
              quoteNumber: quotes.quoteNumber,
              notes: quotes.notes,
              status: quotes.status,
              total: quotes.total,
              createdAt: quotes.createdAt,
            })
            .from(quotes)
            .where(
              and(
                eq(quotes.tenantId, tenantId),
                eq(quotes.customerId, opp.customerId),
                sql`(${quotes.snapshot}->>'opportunityId') IS NULL`,
              ),
            )
            .orderBy(desc(quotes.createdAt))
            .limit(20);
        }

        linkedQuotes = qRows.map((q) => ({
          id: q.id,
          quoteNumber: q.quoteNumber,
          title: q.notes || q.quoteNumber,
          status: q.status,
          totalAmount: Number(q.total || 0),
          createdAt: q.createdAt.toISOString(),
        }));
      } catch {
        // Fallback
      }

      // 2. Linked tasks (strictly prioritize tasks assigned to this opportunity/project)
      let linkedTasks: Array<{
        id: string;
        taskCode: string;
        title: string;
        status: string;
        priority: string;
        dueDate: string | null;
        assigneeName?: string | null;
      }> = [];

      try {
        let tRows = await db
          .select({
            id: tasks.id,
            taskCode: tasks.taskCode,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.tenantId, tenantId),
              eq(tasks.opportunityId, opp.id),
            ),
          )
          .orderBy(desc(tasks.createdAt))
          .limit(20);

        // Fallback to unassigned legacy tasks for this customer only if none are assigned to this project
        if (tRows.length === 0 && opp.customerId) {
          tRows = await db
            .select({
              id: tasks.id,
              taskCode: tasks.taskCode,
              title: tasks.title,
              status: tasks.status,
              priority: tasks.priority,
              dueDate: tasks.dueDate,
            })
            .from(tasks)
            .where(
              and(
                eq(tasks.tenantId, tenantId),
                eq(tasks.customerId, opp.customerId),
                isNull(tasks.opportunityId),
              ),
            )
            .orderBy(desc(tasks.createdAt))
            .limit(20);
        }

        linkedTasks = tRows.map((t) => ({
          id: t.id,
          taskCode: t.taskCode,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        }));
      } catch {
        // Fallback
      }

      // 3. Linked orders (strictly prioritize orders linked to quotes of this opportunity)
      let linkedOrders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        totalAmount: number;
        createdAt: string;
      }> = [];

      try {
        let oRows = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            currentStage: orders.currentStage,
            total: orders.total,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .innerJoin(quotes, eq(orders.quoteId, quotes.id))
          .where(
            and(
              eq(orders.tenantId, tenantId),
              sql`(${quotes.snapshot}->>'opportunityId') = ${opp.id}`,
            ),
          )
          .orderBy(desc(orders.createdAt))
          .limit(10);

        // Fallback to unassigned customer orders
        if (oRows.length === 0 && opp.customerId) {
          oRows = await db
            .select({
              id: orders.id,
              orderNumber: orders.orderNumber,
              currentStage: orders.currentStage,
              total: orders.total,
              createdAt: orders.createdAt,
            })
            .from(orders)
            .leftJoin(quotes, eq(orders.quoteId, quotes.id))
            .where(
              and(
                eq(orders.tenantId, tenantId),
                eq(orders.customerId, opp.customerId),
                or(sql`(${quotes.snapshot}->>'opportunityId') IS NULL`, isNull(orders.quoteId)),
              ),
            )
            .orderBy(desc(orders.createdAt))
            .limit(10);
        }

        linkedOrders = oRows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.currentStage,
          totalAmount: Number(o.total || 0),
          createdAt: o.createdAt.toISOString(),
        }));
      } catch {
        // Fallback
      }

      // 4. Timeline events from audit log
      let timeline: OpportunityTimelineEvent[] = [];
      try {
        const auditRows = await db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            details: auditLog.details,
            createdAt: auditLog.createdAt,
            actorName: appUsers.displayName,
          })
          .from(auditLog)
          .leftJoin(appUsers, eq(auditLog.actorId, appUsers.id))
          .where(
            and(
              eq(auditLog.tenantId, tenantId),
              or(
                eq(auditLog.entityId, opp.id),
                sql`(${auditLog.details}->>'opportunityId' = ${opp.id})`,
                opp.leadId ? eq(auditLog.entityId, opp.leadId) : sql`false`,
              ),
            ),
          )
          .orderBy(desc(auditLog.createdAt))
          .limit(25);

        timeline = auditRows.map((a) => {
          let eventType: OpportunityTimelineEvent["type"] = "system";
          let title = a.action;
          if (a.action === "opportunity_created_from_lead") {
            eventType = "lead_converted";
            title = "Deal Created from Lead";
          } else if (a.action === "stage_changed") {
            eventType = "stage_changed";
            title = "Pipeline Stage Updated";
          } else if (a.action === "lead_created") {
            eventType = "lead_created";
            title = "Initial Lead Created";
          }

          return {
            id: a.id,
            timestamp: a.createdAt.toISOString(),
            type: eventType,
            title,
            description: (a.details as any)?.notes || (a.details as any)?.stage || JSON.stringify(a.details),
            actorName: a.actorName ?? undefined,
            metadata: (a.details as any) || undefined,
          };
        });
      } catch {
        // Fallback
      }

      return {
        id: opp.id,
        tenantId: opp.tenantId,
        opportunityNumber: opp.opportunityNumber,
        customerId: opp.customerId,
        customerName: opp.customerName ?? null,
        customerPhone: opp.customerPhone ?? null,
        customerEmail: opp.customerEmail ?? null,
        leadId: opp.leadId,
        leadNumber: opp.leadNumber ?? null,
        title: opp.title,
        projectType: opp.projectType as ProjectType,
        value: Number(opp.value || 0),
        salesOwner: opp.salesOwner,
        salesOwnerName: opp.salesOwnerName ?? null,
        stage: opp.stage as PipelineStage,
        source: opp.source,
        expectedCloseDate: opp.expectedCloseDate,
        nextAction: opp.nextAction,
        nextActionDate: opp.nextActionDate ? opp.nextActionDate.toISOString() : null,
        siteAddress: opp.siteAddress,
        notes: opp.notes,
        status: opp.status as OpportunityStatus,
        lostReason: opp.lostReason,
        quotesCount: linkedQuotes.length,
        totalQuotesValue: linkedQuotes.reduce((s, q) => s + q.totalAmount, 0),
        tasksCount: linkedTasks.length,
        openTasksCount: linkedTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length,
        ordersCount: linkedOrders.length,
        createdAt: opp.createdAt.toISOString(),
        updatedAt: opp.updatedAt.toISOString(),
        customer: opp.customerId
          ? {
              id: opp.customerId,
              name: opp.customerName || "",
              phone: opp.customerPhone,
              email: opp.customerEmail,
              address: opp.customerAddress,
            }
          : null,
        quotes: linkedQuotes,
        tasks: linkedTasks,
        orders: linkedOrders,
        timeline,
      };
    } catch (err: any) {
      if (err?.code === "42P01") return null;
      throw err;
    }
  });

/**
 * Create a new Opportunity manually.
 */
export const createOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateOpportunityInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<OpportunityItem> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to create opportunities");
    }

    const opportunityNumber = await getNextOpportunityCode(tenantId);
    const assignedSalesOwner = data.salesOwner || (role === "sales" ? userId : null);

    const [inserted] = await db
      .insert(opportunities)
      .values({
        tenantId,
        opportunityNumber,
        customerId: data.customerId,
        leadId: data.leadId || null,
        title: data.title,
        projectType: data.projectType || "residential",
        value: String(data.value || 0),
        salesOwner: assignedSalesOwner,
        stage: data.stage || "new_lead",
        source: data.source || null,
        expectedCloseDate: data.expectedCloseDate || null,
        nextAction: data.nextAction || null,
        nextActionDate: data.nextActionDate ? new Date(data.nextActionDate) : null,
        siteAddress: data.siteAddress || null,
        notes: data.notes || null,
        status: data.stage === "won" ? "won" : data.stage === "lost" ? "lost" : "open",
      })
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "opportunity",
      entityId: inserted.id,
      action: "opportunity_created",
      details: {
        opportunityNumber: inserted.opportunityNumber,
        title: inserted.title,
        customerId: inserted.customerId,
        value: inserted.value,
      },
    });

    return {
      id: inserted.id,
      tenantId: inserted.tenantId,
      opportunityNumber: inserted.opportunityNumber,
      customerId: inserted.customerId,
      leadId: inserted.leadId,
      title: inserted.title,
      projectType: inserted.projectType as ProjectType,
      value: Number(inserted.value || 0),
      salesOwner: inserted.salesOwner,
      stage: inserted.stage as PipelineStage,
      source: inserted.source,
      expectedCloseDate: inserted.expectedCloseDate,
      nextAction: inserted.nextAction,
      nextActionDate: inserted.nextActionDate ? inserted.nextActionDate.toISOString() : null,
      siteAddress: inserted.siteAddress,
      notes: inserted.notes,
      status: inserted.status as OpportunityStatus,
      lostReason: inserted.lostReason,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  });

/**
 * Update an existing Opportunity.
 */
export const updateOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateOpportunityInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<OpportunityItem> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to update opportunities");
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.projectType !== undefined) updatePayload.projectType = data.projectType;
    if (data.value !== undefined) updatePayload.value = String(data.value);
    if (data.salesOwner !== undefined) updatePayload.salesOwner = data.salesOwner;
    if (data.source !== undefined) updatePayload.source = data.source;
    if (data.expectedCloseDate !== undefined) updatePayload.expectedCloseDate = data.expectedCloseDate;
    if (data.nextAction !== undefined) updatePayload.nextAction = data.nextAction;
    if (data.nextActionDate !== undefined) {
      updatePayload.nextActionDate = data.nextActionDate ? new Date(data.nextActionDate) : null;
    }
    if (data.siteAddress !== undefined) updatePayload.siteAddress = data.siteAddress;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.lostReason !== undefined) updatePayload.lostReason = data.lostReason;

    if (data.stage !== undefined) {
      if (data.stage === "lost" && (!data.lostReason || !data.lostReason.trim())) {
        throw new Error("A lost reason is required when marking an opportunity as lost");
      }
      updatePayload.stage = data.stage;
      if (data.stage === "won") updatePayload.status = "won";
      else if (data.stage === "lost") updatePayload.status = "lost";
      else updatePayload.status = "open";
    } else if (data.status !== undefined) {
      updatePayload.status = data.status;
    }

    const [updated] = await db
      .update(opportunities)
      .set(updatePayload)
      .where(and(eq(opportunities.id, data.id), eq(opportunities.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new Error("Opportunity not found or unauthorized");
    }

    // Audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "opportunity",
      entityId: updated.id,
      action: data.stage ? "stage_changed" : "opportunity_updated",
      details: updatePayload,
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      opportunityNumber: updated.opportunityNumber,
      customerId: updated.customerId,
      leadId: updated.leadId,
      title: updated.title,
      projectType: updated.projectType as ProjectType,
      value: Number(updated.value || 0),
      salesOwner: updated.salesOwner,
      stage: updated.stage as PipelineStage,
      source: updated.source,
      expectedCloseDate: updated.expectedCloseDate,
      nextAction: updated.nextAction,
      nextActionDate: updated.nextActionDate ? updated.nextActionDate.toISOString() : null,
      siteAddress: updated.siteAddress,
      notes: updated.notes,
      status: updated.status as OpportunityStatus,
      lostReason: updated.lostReason,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });

/**
 * Change stage directly (e.g. from Kanban drag-and-drop).
 */
export const changeOpportunityStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ChangeOpportunityStageInput.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean; newStage: PipelineStage }> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to change stage");
    }

    if (data.stage === "lost" && (!data.lostReason || !data.lostReason.trim())) {
      throw new Error("A lost reason is required when marking an opportunity as lost");
    }

    let status: OpportunityStatus = "open";
    if (data.stage === "won") status = "won";
    else if (data.stage === "lost") status = "lost";

    const [updated] = await db
      .update(opportunities)
      .set({
        stage: data.stage,
        status,
        lostReason: data.stage === "lost" ? data.lostReason : null,
        updatedAt: new Date(),
      })
      .where(and(eq(opportunities.id, data.opportunityId), eq(opportunities.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new Error("Opportunity not found or unauthorized");
    }

    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "opportunity",
      entityId: updated.id,
      action: "stage_changed",
      details: {
        previousStage: updated.stage,
        newStage: data.stage,
        status,
        lostReason: data.lostReason || null,
      },
    });

    return {
      success: true,
      newStage: data.stage,
    };
  });

/**
 * Create a native task linked to an Opportunity.
 * Automatically updates the Opportunity's nextAction and nextActionDate!
 */
export const createOpportunityTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateOpportunityTaskInput.parse(input))
  .handler(async ({ data, context }): Promise<{ taskId: string; taskCode: string }> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to create tasks");
    }

    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, data.opportunityId), eq(opportunities.tenantId, tenantId)));

    if (!opp) {
      throw new Error("Opportunity not found");
    }

    const taskCode = await getNextTaskCode(tenantId);
    const dueDateObj = data.dueDate ? new Date(data.dueDate) : null;

    const [newTask] = await db
      .insert(tasks)
      .values({
        tenantId,
        taskCode,
        title: data.title,
        description: data.description || null,
        status: "not_started",
        priority: data.priority,
        category: "crm_follow_up",
        dueDate: dueDateObj,
        customerId: opp.customerId,
        opportunityId: opp.id,
        createdBy: userId,
      })
      .returning();

    // Assign if requested
    if (data.assigneeId) {
      await db.insert(taskAssignees).values({
        tenantId,
        taskId: newTask.id,
        userId: data.assigneeId,
      });
    }

    // Update next action on the opportunity
    await db
      .update(opportunities)
      .set({
        nextAction: data.title,
        nextActionDate: dueDateObj,
        updatedAt: new Date(),
      })
      .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tenantId)));

    // Audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "task",
      entityId: newTask.id,
      action: "task_created_for_opportunity",
      details: {
        taskCode: newTask.taskCode,
        opportunityId: opp.id,
        opportunityNumber: opp.opportunityNumber,
        title: newTask.title,
      },
    });

    return {
      taskId: newTask.id,
      taskCode: newTask.taskCode,
    };
  });

/**
 * Get aggregated CRM metrics:
 * Pipeline Value, Open Deals, Won Deals, Leads count, Attention Required count, and Stage breakdowns.
 */
export const getCRMStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }): Promise<CRMStats> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to CRM");
    }

    const defaultStats: CRMStats = {
      totalPipelineValue: 0,
      openDealsCount: 0,
      wonDealsCount: 0,
      wonDealsValue: 0,
      leadsCount: 0,
      newLeadsCount: 0,
      attentionRequiredCount: 0,
      stageBreakdown: {
        new_lead: { count: 0, value: 0 },
        contacted: { count: 0, value: 0 },
        qualified: { count: 0, value: 0 },
        site_visit: { count: 0, value: 0 },
        design_measurement: { count: 0, value: 0 },
        quotation: { count: 0, value: 0 },
        negotiation: { count: 0, value: 0 },
        won: { count: 0, value: 0 },
        lost: { count: 0, value: 0 },
      },
    };

    try {
      // 1. Leads counts
      const [leadAgg] = await db
        .select({
          total: sql<number>`count(*)::int`,
          newCount: sql<number>`count(case when ${leads.status} = 'new' then 1 end)::int`,
        })
        .from(leads)
        .where(eq(leads.tenantId, tenantId));

      defaultStats.leadsCount = leadAgg?.total || 0;
      defaultStats.newLeadsCount = leadAgg?.newCount || 0;

      // 2. Opportunities counts & sums
      const oppAgg = await db
        .select({
          stage: opportunities.stage,
          status: opportunities.status,
          count: sql<number>`count(*)::int`,
          totalValue: sql<number>`coalesce(sum(${opportunities.value}), 0)::numeric`,
          noNextActionCount: sql<number>`count(case when ${opportunities.status} = 'open' and (${opportunities.nextAction} is null or ${opportunities.nextActionDate} < now()) then 1 end)::int`,
        })
        .from(opportunities)
        .where(eq(opportunities.tenantId, tenantId))
        .groupBy(opportunities.stage, opportunities.status);

      let totalPipelineValue = 0;
      let openDealsCount = 0;
      let wonDealsCount = 0;
      let wonDealsValue = 0;
      let attentionRequired = 0;

      for (const row of oppAgg) {
        const stage = row.stage as PipelineStage;
        const count = Number(row.count || 0);
        const val = Number(row.totalValue || 0);

        if (defaultStats.stageBreakdown[stage]) {
          defaultStats.stageBreakdown[stage].count += count;
          defaultStats.stageBreakdown[stage].value += val;
        }

        if (row.status === "open") {
          openDealsCount += count;
          totalPipelineValue += val;
        } else if (row.status === "won" || stage === "won") {
          wonDealsCount += count;
          wonDealsValue += val;
        }

        attentionRequired += Number(row.noNextActionCount || 0);
      }

      defaultStats.totalPipelineValue = totalPipelineValue;
      defaultStats.openDealsCount = openDealsCount;
      defaultStats.wonDealsCount = wonDealsCount;
      defaultStats.wonDealsValue = wonDealsValue;
      defaultStats.attentionRequiredCount = attentionRequired;

      return defaultStats;
    } catch (err: any) {
      if (err?.code === "42P01") {
        return defaultStats;
      }
      throw err;
    }
  });

/**
 * List team members eligible for sales ownership / assignment (roles: owner, admin, sales).
 */
export const listSalesMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }): Promise<Array<{ id: string; name: string; email: string; role: string }>> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    try {
      const rows = await db
        .select({
          id: appUsers.id,
          displayName: appUsers.displayName,
          username: appUsers.username,
          role: tenantMembers.role,
        })
        .from(tenantMembers)
        .innerJoin(appUsers, eq(tenantMembers.userId, appUsers.id))
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            inArray(tenantMembers.role, ["owner", "admin", "sales"]),
          ),
        )
        .orderBy(asc(appUsers.displayName));

      return rows.map((r) => ({
        id: r.id,
        name: r.displayName || r.username || "Unknown",
        email: r.username || "",
        role: r.role || "sales",
      }));
    } catch (err) {
      return [];
    }
  });

// ── TASK 25: Sales Team & Follow-Up Operations Server Functions ──────────────

const ActivityTypeSchema = z.enum([
  "call",
  "whatsapp",
  "email",
  "site_visit",
  "meeting",
  "quote_follow_up",
  "other",
]);

const GetSalesWorkspaceInput = z
  .object({
    selectedSalesOwner: z.string().optional().default("all"),
  })
  .optional()
  .default({});

const LogActivityInputSchema = z.object({
  entityType: z.enum(["opportunity", "lead"]),
  entityId: z.string().uuid(),
  activityType: ActivityTypeSchema,
  notes: z.string().trim().min(1, "Notes are required").max(2000),
  nextAction: z.string().trim().optional().nullable(),
  nextActionDate: z.string().optional().nullable(),
  markFollowUpCompleted: z.boolean().optional().default(false),
  relatedTaskId: z.string().uuid().optional().nullable(),
});

const AssignEntityInputSchema = z.object({
  entityType: z.enum(["opportunity", "lead"]),
  entityId: z.string().uuid(),
  salesOwnerId: z.string().uuid().nullable().optional(),
});

const BulkAssignEntitiesInputSchema = z.object({
  entityType: z.enum(["opportunity", "lead"]),
  entityIds: z.array(z.string().uuid()).min(1, "At least one item must be selected"),
  salesOwnerId: z.string().uuid().nullable().optional(),
});

/**
 * Get comprehensive Sales Workspace data including per-salesperson workload,
 * overall KPIs, attention items (overdue, due today, no next action), and My Sales slice.
 */
export const getSalesWorkspaceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => GetSalesWorkspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    // Security: Workers have no access to CRM
    if (role === "worker") {
      throw new Error("Forbidden: Workers do not have access to Sales Workspace");
    }

    const selectedOwner = data?.selectedSalesOwner || "all";
    const targetRepId = selectedOwner !== "all" ? selectedOwner : userId;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Fetch team members eligible for sales (owner, admin, sales)
    const teamRows = await db
      .select({
        id: appUsers.id,
        displayName: appUsers.displayName,
        username: appUsers.username,
        role: tenantMembers.role,
      })
      .from(tenantMembers)
      .innerJoin(appUsers, eq(tenantMembers.userId, appUsers.id))
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          inArray(tenantMembers.role, ["owner", "admin", "sales"]),
        ),
      )
      .orderBy(asc(appUsers.displayName));

    // 2. Fetch all leads for this tenant
    const leadRows = await db
      .select({
        id: leads.id,
        leadNumber: leads.leadNumber,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        location: leads.location,
        source: leads.source,
        interestedProduct: leads.interestedProduct,
        estimatedBudget: leads.estimatedBudget,
        notes: leads.notes,
        assignedSalesperson: leads.assignedSalesperson,
        status: leads.status,
        nextAction: leads.nextAction,
        nextActionDate: leads.nextActionDate,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(1000);

    // 3. Fetch all opportunities for this tenant
    const oppRows = await db
      .select({
        id: opportunities.id,
        opportunityNumber: opportunities.opportunityNumber,
        customerId: opportunities.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        leadId: opportunities.leadId,
        title: opportunities.title,
        projectType: opportunities.projectType,
        value: opportunities.value,
        salesOwner: opportunities.salesOwner,
        stage: opportunities.stage,
        source: opportunities.source,
        expectedCloseDate: opportunities.expectedCloseDate,
        nextAction: opportunities.nextAction,
        nextActionDate: opportunities.nextActionDate,
        siteAddress: opportunities.siteAddress,
        notes: opportunities.notes,
        status: opportunities.status,
        lostReason: opportunities.lostReason,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(customers, eq(opportunities.customerId, customers.id))
      .where(eq(opportunities.tenantId, tenantId))
      .orderBy(desc(opportunities.createdAt))
      .limit(1000);

    // 4. Fetch quotes for this tenant to link to opportunities
    const quoteRows = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        opportunityId: sql<string | null>`(${quotes.snapshot}->>'opportunityId')`.as("opportunity_id"),
        total: quotes.total,
        subtotal: quotes.subtotal,
        status: quotes.status,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(eq(quotes.tenantId, tenantId))
      .limit(2000);

    // 5. Fetch open follow-up tasks for this tenant
    const taskRows = await db
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        opportunityId: tasks.opportunityId,
        customerId: tasks.customerId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.category, "crm_follow_up"),
        ),
      )
      .limit(1000);

    const taskAssigneeRows = await db
      .select({
        taskId: taskAssignees.taskId,
        userId: taskAssignees.userId,
      })
      .from(taskAssignees)
      .where(eq(taskAssignees.tenantId, tenantId));

    const taskAssigneeMap = new Map<string, string[]>();
    for (const a of taskAssigneeRows) {
      const list = taskAssigneeMap.get(a.taskId) || [];
      list.push(a.userId);
      taskAssigneeMap.set(a.taskId, list);
    }

    // Name lookup map
    const userNames = new Map<string, string>();
    for (const m of teamRows) {
      userNames.set(m.id, m.displayName || m.username || "Team Member");
    }

    // Quote count and value per opportunity
    const oppQuoteMap = new Map<string, { count: number; total: number }>();
    for (const q of quoteRows) {
      if (q.opportunityId) {
        const cur = oppQuoteMap.get(q.opportunityId) || { count: 0, total: 0 };
        cur.count++;
        cur.total += Number(q.total || 0);
        oppQuoteMap.set(q.opportunityId, cur);
      }
    }

    // ── Build Attention Items ───────────────────────────────────────────────
    const attentionItems: AttentionItem[] = [];

    for (const opp of oppRows) {
      if (opp.status !== "open") continue;

      const oppValue = Number(opp.value || 0);
      const repName = opp.salesOwner ? userNames.get(opp.salesOwner) || "Unassigned" : "Unassigned";

      // 1. Overdue next action
      if (opp.nextActionDate && new Date(opp.nextActionDate).getTime() < startOfToday.getTime()) {
        attentionItems.push({
          id: opp.id,
          entityType: "opportunity",
          code: opp.opportunityNumber,
          title: opp.title,
          customerId: opp.customerId,
          customerName: opp.customerName,
          customerPhone: opp.customerPhone,
          salesOwnerId: opp.salesOwner,
          salesOwnerName: repName,
          stage: opp.stage as PipelineStage,
          value: oppValue,
          nextAction: opp.nextAction,
          nextActionDate: opp.nextActionDate?.toISOString() || null,
          reason: "overdue",
          reasonLabel: "Overdue Follow-Up",
          reasonLabelAr: "متابعة متأخرة تجاوزت الموعد",
          urgency: "critical",
        });
      }
      // 2. Due today
      else if (
        opp.nextActionDate &&
        new Date(opp.nextActionDate).getTime() >= startOfToday.getTime() &&
        new Date(opp.nextActionDate).getTime() <= endOfToday.getTime()
      ) {
        attentionItems.push({
          id: opp.id,
          entityType: "opportunity",
          code: opp.opportunityNumber,
          title: opp.title,
          customerId: opp.customerId,
          customerName: opp.customerName,
          customerPhone: opp.customerPhone,
          salesOwnerId: opp.salesOwner,
          salesOwnerName: repName,
          stage: opp.stage as PipelineStage,
          value: oppValue,
          nextAction: opp.nextAction,
          nextActionDate: opp.nextActionDate?.toISOString() || null,
          reason: "due_today",
          reasonLabel: "Due Today",
          reasonLabelAr: "مطلوب المتابعة اليوم",
          urgency: "warning",
        });
      }
      // 3. No next action set
      else if (!opp.nextAction || !opp.nextAction.trim()) {
        attentionItems.push({
          id: opp.id,
          entityType: "opportunity",
          code: opp.opportunityNumber,
          title: opp.title,
          customerId: opp.customerId,
          customerName: opp.customerName,
          customerPhone: opp.customerPhone,
          salesOwnerId: opp.salesOwner,
          salesOwnerName: repName,
          stage: opp.stage as PipelineStage,
          value: oppValue,
          nextAction: null,
          nextActionDate: null,
          reason: "no_next_action",
          reasonLabel: "No Next Action Set",
          reasonLabelAr: "فرصة نشطة بدون إجراء تالٍ",
          urgency: "critical",
        });
      }
      // 4. Quotation sent without active follow-up
      else if (opp.stage === "quotation" && (!opp.nextActionDate || new Date(opp.nextActionDate).getTime() < now.getTime())) {
        attentionItems.push({
          id: opp.id,
          entityType: "opportunity",
          code: opp.opportunityNumber,
          title: opp.title,
          customerId: opp.customerId,
          customerName: opp.customerName,
          customerPhone: opp.customerPhone,
          salesOwnerId: opp.salesOwner,
          salesOwnerName: repName,
          stage: opp.stage as PipelineStage,
          value: oppValue,
          nextAction: opp.nextAction,
          nextActionDate: opp.nextActionDate?.toISOString() || null,
          reason: "quote_without_followup",
          reasonLabel: "Quotation Awaiting Follow-Up",
          reasonLabelAr: "عرض سعر مرسل يحتاج متابعة",
          urgency: "warning",
        });
      }
      // 5. Negotiation without next action
      else if (opp.stage === "negotiation" && (!opp.nextAction || !opp.nextAction.trim())) {
        attentionItems.push({
          id: opp.id,
          entityType: "opportunity",
          code: opp.opportunityNumber,
          title: opp.title,
          customerId: opp.customerId,
          customerName: opp.customerName,
          customerPhone: opp.customerPhone,
          salesOwnerId: opp.salesOwner,
          salesOwnerName: repName,
          stage: opp.stage as PipelineStage,
          value: oppValue,
          nextAction: null,
          nextActionDate: null,
          reason: "negotiation_without_next_action",
          reasonLabel: "Negotiation Without Action",
          reasonLabelAr: "مفاوضات نشطة بدون موعد تواصل",
          urgency: "critical",
        });
      }
    }

    // Sort attention items: critical first, then warning
    attentionItems.sort((a, b) => {
      const urgencyScore = { critical: 2, warning: 1, info: 0 };
      const diff = urgencyScore[b.urgency] - urgencyScore[a.urgency];
      if (diff !== 0) return diff;
      return (a.nextActionDate || "").localeCompare(b.nextActionDate || "");
    });

    // ── Build Team Workload ─────────────────────────────────────────────────
    const teamWorkload: SalespersonWorkload[] = [];

    // Include an "Unassigned" pseudo-member first so managers immediately see unassigned deals
    const unassignedLeads = leadRows.filter(
      (l) => !l.assignedSalesperson && !["converted", "lost"].includes(l.status),
    );
    const unassignedOpps = oppRows.filter((o) => !o.salesOwner && o.status === "open");
    const unassignedValue = unassignedOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);
    const unassignedWon = oppRows.filter((o) => !o.salesOwner && o.status === "won");
    const unassignedLost = oppRows.filter((o) => !o.salesOwner && o.status === "lost");

    if (unassignedLeads.length > 0 || unassignedOpps.length > 0) {
      teamWorkload.push({
        userId: "unassigned",
        username: "unassigned",
        displayName: "غير مسند (Unassigned)",
        role: "unassigned",
        activeLeadsCount: unassignedLeads.length,
        openOpportunitiesCount: unassignedOpps.length,
        pipelineValue: unassignedValue,
        quotesCount: 0,
        quotesValue: 0,
        overdueFollowUpsCount: unassignedOpps.filter(
          (o) => o.nextActionDate && new Date(o.nextActionDate).getTime() < startOfToday.getTime(),
        ).length,
        dueTodayCount: unassignedOpps.filter(
          (o) => o.nextActionDate && new Date(o.nextActionDate).getTime() >= startOfToday.getTime() && new Date(o.nextActionDate).getTime() <= endOfToday.getTime(),
        ).length,
        noNextActionCount: unassignedOpps.filter((o) => !o.nextAction || !o.nextAction.trim()).length,
        wonCount: unassignedWon.length,
        wonValue: unassignedWon.reduce((sum, o) => sum + Number(o.value || 0), 0),
        lostCount: unassignedLost.length,
        lostValue: unassignedLost.reduce((sum, o) => sum + Number(o.value || 0), 0),
        workloadLevel: unassignedOpps.length > 10 ? "overloaded" : unassignedOpps.length > 5 ? "heavy" : "balanced",
      });
    }

    for (const member of teamRows) {
      const repLeads = leadRows.filter(
        (l) => l.assignedSalesperson === member.id && !["converted", "lost"].includes(l.status),
      );
      const repOpps = oppRows.filter((o) => o.salesOwner === member.id && o.status === "open");
      const repPipelineVal = repOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);

      // Rep quotes
      let repQuotesCount = 0;
      let repQuotesVal = 0;
      for (const opp of repOpps) {
        const qInfo = oppQuoteMap.get(opp.id);
        if (qInfo) {
          repQuotesCount += qInfo.count;
          repQuotesVal += qInfo.total;
        }
      }

      // Rep overdue
      const repOverdueOpps = repOpps.filter(
        (o) => o.nextActionDate && new Date(o.nextActionDate).getTime() < startOfToday.getTime(),
      );
      const repDueTodayOpps = repOpps.filter(
        (o) =>
          o.nextActionDate &&
          new Date(o.nextActionDate).getTime() >= startOfToday.getTime() &&
          new Date(o.nextActionDate).getTime() <= endOfToday.getTime(),
      );
      const repNoActionOpps = repOpps.filter((o) => !o.nextAction || !o.nextAction.trim());

      const repWon = oppRows.filter((o) => o.salesOwner === member.id && o.status === "won");
      const repLost = oppRows.filter((o) => o.salesOwner === member.id && o.status === "lost");

      // Workload categorization
      let workloadLevel: "low" | "balanced" | "heavy" | "overloaded" = "low";
      const totalActiveDeals = repOpps.length;
      if (totalActiveDeals > 15 || repOverdueOpps.length > 5) {
        workloadLevel = "overloaded";
      } else if (totalActiveDeals > 8) {
        workloadLevel = "heavy";
      } else if (totalActiveDeals > 3) {
        workloadLevel = "balanced";
      }

      teamWorkload.push({
        userId: member.id,
        username: member.username,
        displayName: member.displayName || member.username,
        role: member.role,
        activeLeadsCount: repLeads.length,
        openOpportunitiesCount: repOpps.length,
        pipelineValue: repPipelineVal,
        quotesCount: repQuotesCount,
        quotesValue: repQuotesVal,
        overdueFollowUpsCount: repOverdueOpps.length,
        dueTodayCount: repDueTodayOpps.length,
        noNextActionCount: repNoActionOpps.length,
        wonCount: repWon.length,
        wonValue: repWon.reduce((sum, o) => sum + Number(o.value || 0), 0),
        lostCount: repLost.length,
        lostValue: repLost.reduce((sum, o) => sum + Number(o.value || 0), 0),
        workloadLevel,
      });
    }

    // ── Build Overall KPIs (No unsupported forecast numbers) ─────────────────
    const openOpps = oppRows.filter((o) => o.status === "open");
    const wonOpps = oppRows.filter((o) => o.status === "won");
    const lostOpps = oppRows.filter((o) => o.status === "lost");
    const sentQuotes = quoteRows.filter((q) => q.status === "sent");

    const kpis: SalesWorkspaceKPIs = {
      newLeadsCount: leadRows.filter((l) => l.status === "new").length,
      openOpportunitiesCount: openOpps.length,
      pipelineValue: openOpps.reduce((sum, o) => sum + Number(o.value || 0), 0),
      dueTodayCount: openOpps.filter(
        (o) =>
          o.nextActionDate &&
          new Date(o.nextActionDate).getTime() >= startOfToday.getTime() &&
          new Date(o.nextActionDate).getTime() <= endOfToday.getTime(),
      ).length,
      overdueCount: openOpps.filter(
        (o) => o.nextActionDate && new Date(o.nextActionDate).getTime() < startOfToday.getTime(),
      ).length,
      quotesAwaitingResponseCount: sentQuotes.length,
      wonCount: wonOpps.length,
      wonValue: wonOpps.reduce((sum, o) => sum + Number(o.value || 0), 0),
      lostCount: lostOpps.length,
    };

    // ── Build "My Sales" slice if targetRepId is determined ──────────────────
    let mySales = null;
    if (targetRepId) {
      const myLeads = leadRows.filter((l) => l.assignedSalesperson === targetRepId);
      const myOpps = oppRows.filter((o) => o.salesOwner === targetRepId);
      const myOppIds = new Set(myOpps.map((o) => o.id));
      const myQuotes = quoteRows.filter((q) => q.opportunityId && myOppIds.has(q.opportunityId));
      const myOverdueActions = attentionItems.filter((item) => item.salesOwnerId === targetRepId);

      // Tasks assigned to this rep or linked to their opps
      const myTasks = taskRows.filter((t) => {
        const assignees = taskAssigneeMap.get(t.id) || [];
        return assignees.includes(targetRepId) || (t.opportunityId && myOppIds.has(t.opportunityId));
      });

      mySales = {
        repId: targetRepId,
        repName: userNames.get(targetRepId) || (targetRepId === "unassigned" ? "Unassigned" : "My Account"),
        leads: myLeads.map((l) => ({
          ...l,
          estimatedBudget: Number(l.estimatedBudget || 0),
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
          nextActionDate: l.nextActionDate?.toISOString() || null,
          source: l.source as LeadSource,
          status: l.status as LeadStatus,
        })),
        opportunities: myOpps.map((o) => ({
          ...o,
          value: Number(o.value || 0),
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
          expectedCloseDate: o.expectedCloseDate || null,
          nextActionDate: o.nextActionDate?.toISOString() || null,
          projectType: o.projectType as ProjectType,
          stage: o.stage as PipelineStage,
          status: o.status as OpportunityStatus,
          quotesCount: oppQuoteMap.get(o.id)?.count || 0,
          totalQuotesValue: oppQuoteMap.get(o.id)?.total || 0,
        })),
        quotes: myQuotes.map((q) => ({
          id: q.id,
          quoteNumber: q.quoteNumber,
          opportunityId: q.opportunityId,
          total: Number(q.total || 0),
          status: q.status,
          createdAt: q.createdAt.toISOString(),
        })),
        tasks: myTasks.map((t) => ({
          id: t.id,
          taskCode: t.taskCode,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() || null,
          opportunityId: t.opportunityId,
        })),
        overdueActions: myOverdueActions,
      };
    }

    return {
      kpis,
      teamWorkload,
      attentionItems: attentionItems.slice(0, 100),
      mySales,
      currentUserId: userId,
      currentUserRole: role,
    };
  });

/**
 * Log a lightweight commercial activity (Call, WhatsApp, Email, Visit, Meeting, Quote Follow-Up).
 * Completes related follow-up task if requested, updates opportunity nextAction, and records audit trail.
 */
export const logCRMActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => LogActivityInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    // Security: Workers and Viewers cannot log activities
    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to log CRM activity");
    }

    const {
      entityType,
      entityId,
      activityType,
      notes,
      nextAction,
      nextActionDate,
      markFollowUpCompleted,
      relatedTaskId,
    } = data;

    const parsedNextActionDate = nextActionDate ? new Date(nextActionDate) : null;

    if (entityType === "opportunity") {
      const [opp] = await db
        .select({
          id: opportunities.id,
          title: opportunities.title,
          opportunityNumber: opportunities.opportunityNumber,
          salesOwner: opportunities.salesOwner,
        })
        .from(opportunities)
        .where(and(eq(opportunities.id, entityId), eq(opportunities.tenantId, tenantId)))
        .limit(1);

      if (!opp) {
        throw new Error("Opportunity not found");
      }

      // Update Opportunity next action
      await db
        .update(opportunities)
        .set({
          ...(nextAction !== undefined ? { nextAction: nextAction || null } : {}),
          ...(parsedNextActionDate !== undefined ? { nextActionDate: parsedNextActionDate } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tenantId)));

      // If completing a task
      if (markFollowUpCompleted && relatedTaskId) {
        await db
          .update(tasks)
          .set({
            status: "completed",
            completedAt: new Date(),
            reviewNotes: notes,
          })
          .where(and(eq(tasks.id, relatedTaskId), eq(tasks.tenantId, tenantId)));
      }

      // Record in audit log
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "opportunity",
        entityId: opp.id,
        action: "crm_activity_completed",
        details: {
          activityType,
          notes,
          nextAction,
          nextActionDate: parsedNextActionDate?.toISOString() || null,
          completedTaskId: markFollowUpCompleted ? relatedTaskId : null,
          opportunityNumber: opp.opportunityNumber,
        },
      });

      return { success: true, entityId: opp.id };
    } else {
      // Lead activity
      const [lead] = await db
        .select({
          id: leads.id,
          name: leads.name,
          leadNumber: leads.leadNumber,
          assignedSalesperson: leads.assignedSalesperson,
        })
        .from(leads)
        .where(and(eq(leads.id, entityId), eq(leads.tenantId, tenantId)))
        .limit(1);

      if (!lead) {
        throw new Error("Lead not found");
      }

      await db
        .update(leads)
        .set({
          ...(nextAction !== undefined ? { nextAction: nextAction || null } : {}),
          ...(parsedNextActionDate !== undefined ? { nextActionDate: parsedNextActionDate } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));

      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "lead",
        entityId: lead.id,
        action: "crm_activity_completed",
        details: {
          activityType,
          notes,
          nextAction,
          nextActionDate: parsedNextActionDate?.toISOString() || null,
          leadNumber: lead.leadNumber,
        },
      });

      return { success: true, entityId: lead.id };
    }
  });

/**
 * Assign / Reassign a single Lead or Opportunity to a salesperson.
 */
export const assignCRMEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AssignEntityInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    // Role check: Only owner, admin, or sales can assign/reassign
    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: Insufficient permissions to assign CRM entities");
    }

    const { entityType, entityId, salesOwnerId } = data;

    // If salesOwnerId is specified, ensure user belongs to tenant
    if (salesOwnerId) {
      const [member] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, salesOwnerId),
          ),
        )
        .limit(1);

      if (!member) {
        throw new Error("Target salesperson does not belong to this tenant");
      }
    }

    if (entityType === "opportunity") {
      const [opp] = await db
        .select({ id: opportunities.id, opportunityNumber: opportunities.opportunityNumber, previousOwner: opportunities.salesOwner })
        .from(opportunities)
        .where(and(eq(opportunities.id, entityId), eq(opportunities.tenantId, tenantId)))
        .limit(1);

      if (!opp) {
        throw new Error("Opportunity not found");
      }

      await db
        .update(opportunities)
        .set({
          salesOwner: salesOwnerId || null,
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tenantId)));

      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "opportunity",
        entityId: opp.id,
        action: "entity_assigned",
        details: {
          previousOwner: opp.previousOwner,
          newOwner: salesOwnerId,
          opportunityNumber: opp.opportunityNumber,
        },
      });

      return { success: true, entityId: opp.id, salesOwnerId };
    } else {
      const [lead] = await db
        .select({ id: leads.id, leadNumber: leads.leadNumber, previousOwner: leads.assignedSalesperson })
        .from(leads)
        .where(and(eq(leads.id, entityId), eq(leads.tenantId, tenantId)))
        .limit(1);

      if (!lead) {
        throw new Error("Lead not found");
      }

      await db
        .update(leads)
        .set({
          assignedSalesperson: salesOwnerId || null,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));

      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "lead",
        entityId: lead.id,
        action: "entity_assigned",
        details: {
          previousOwner: lead.previousOwner,
          newOwner: salesOwnerId,
          leadNumber: lead.leadNumber,
        },
      });

      return { success: true, entityId: lead.id, salesOwnerId };
    }
  });

/**
 * Bulk assign multiple Leads or Opportunities to a salesperson.
 */
export const bulkAssignCRMEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => BulkAssignEntitiesInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    // Role check: Only admin or owner can bulk assign
    if (role !== "owner" && role !== "admin") {
      throw new Error("Forbidden: Only owners and admins can perform bulk assignments");
    }

    const { entityType, entityIds, salesOwnerId } = data;

    if (salesOwnerId) {
      const [member] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, salesOwnerId),
          ),
        )
        .limit(1);

      if (!member) {
        throw new Error("Target salesperson does not belong to this tenant");
      }
    }

    if (entityType === "opportunity") {
      await db
        .update(opportunities)
        .set({
          salesOwner: salesOwnerId || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(opportunities.tenantId, tenantId),
            inArray(opportunities.id, entityIds),
          ),
        );

      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "opportunity",
        entityId: entityIds[0],
        action: "bulk_entity_assigned",
        details: {
          count: entityIds.length,
          newOwner: salesOwnerId,
          entityIds,
        },
      });

      return { success: true, count: entityIds.length };
    } else {
      await db
        .update(leads)
        .set({
          assignedSalesperson: salesOwnerId || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(leads.tenantId, tenantId),
            inArray(leads.id, entityIds),
          ),
        );

      await db.insert(auditLog).values({
        tenantId,
        actorId: userId || "00000000-0000-0000-0000-000000000000",
        entityType: "lead",
        entityId: entityIds[0],
        action: "bulk_entity_assigned",
        details: {
          count: entityIds.length,
          newOwner: salesOwnerId,
          entityIds,
        },
      });

      return { success: true, count: entityIds.length };
    }
  });
