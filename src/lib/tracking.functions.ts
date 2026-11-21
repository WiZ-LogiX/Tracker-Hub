import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { requirePermission, requireAnyPermission, type TenantContext } from "@/lib/tenant-context";

export const getPublicOrdersByPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const { handlePublicOrdersByPhone } = await import("./tracking.server");
    return handlePublicOrdersByPhone(data);
  });

const Input = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  phone: z.string().trim().min(4).max(32),
});

export const getPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { handlePublicOrder } = await import("./tracking.server");
    return handlePublicOrder(data);
  });

export const getPublicTrackingByRef = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ reference: z.string().trim().min(3).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { handlePublicTrackingByRef } = await import("./tracking.server");
    return handlePublicTrackingByRef(data);
  });

export const getPublicQuotePdfDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ trackingToken: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { handleGetPublicQuotePdfDownloadUrl } = await import("./tracking.server");
    return handleGetPublicQuotePdfDownloadUrl(data);
  });

export const submitPublicCustomerDecision = createServerFn({ method: "POST" })
  .inputValidator(
    (d) =>
      z
        .object({
          trackingToken: z.string().uuid(),
          decision: z.enum(["accept", "reject", "revision_requested"]),
          notes: z.string().max(1000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const { handleCustomerQuoteDecisionInternal } = await import("@/lib/quote-decision.server");
    return handleCustomerQuoteDecisionInternal({
      trackingToken: data.trackingToken,
      decision: data.decision,
      notes: data.notes,
      channel: "track_page",
    });
  });

const UploadPhotoInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string().min(1),
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  caption: z.string().optional(),
});

export const uploadProductionPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UploadPhotoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.edit", "work-orders.edit"]);
    const { handleUploadProductionPhoto } = await import("./tracking.server");
    return handleUploadProductionPhoto(data, ctx.tenantId, ctx.userId);
  });

const DeletePhotoInput = z.object({
  photoId: z.string().uuid(),
});

export const deleteProductionPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DeletePhotoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.edit", "work-orders.edit"]);
    const { handleDeleteProductionPhoto } = await import("./tracking.server");
    return handleDeleteProductionPhoto(data.photoId, ctx.tenantId);
  });

const LogStageInput = z.object({
  orderId: z.string().uuid(),
  stageFrom: z.string(),
  stageTo: z.string(),
  notes: z.string().nullable(),
});

export const logStageTransition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => LogStageInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.status.update", "orders.edit"]);
    const { handleLogStageTransition } = await import("./tracking.server");
    return handleLogStageTransition(data, ctx.userId);
  });

const UpdateOrderStageInput = z.object({
  orderId: z.string().uuid(),
  nextStage: z.string(),
  markDelivered: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  autoCreateWorkOrder: z.boolean().optional(),
});

export const updateOrderStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateOrderStageInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.status.update", "orders.edit"]);
    const { handleUpdateOrderStage } = await import("./tracking.server");
    return handleUpdateOrderStage(data, ctx.tenantId, ctx.userId);
  });

const AssignmentInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string(),
  workerId: z.string().uuid(),
  status: z.string().optional(),
});

export const assignProductionWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AssignmentInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.assign", "work-orders.assign"]);
    const { handleAssignProductionWorker } = await import("./tracking.server");
    return handleAssignProductionWorker(data);
  });

const UpdateAssignmentInput = z.object({
  id: z.string().uuid(),
  patch: z.record(z.string(), z.any()),
});

export const updateProductionAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateAssignmentInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.assign", "work-orders.assign"]);
    const { handleUpdateProductionAssignment } = await import("./tracking.server");
    return handleUpdateProductionAssignment(data);
  });

const DeleteAssignmentInput = z.object({ id: z.string().uuid() });

export const deleteProductionAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DeleteAssignmentInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.assign", "work-orders.assign"]);
    const { handleDeleteProductionAssignment } = await import("./tracking.server");
    return handleDeleteProductionAssignment(data.id);
  });

const RecordQCInput = z.object({
  orderId: z.string().uuid(),
  stage: z.string(),
  passed: z.boolean(),
  notes: z.string().nullable().optional(),
  inspectorId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

export const recordQCInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => RecordQCInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAnyPermission(ctx, ["orders.qc", "work-orders.edit"]);
    const { handleRecordQCInspection } = await import("./tracking.server");
    return handleRecordQCInspection(data, ctx.tenantId, ctx.userId);
  });

const RecordRemakeInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string(),
  status: z.string().optional(),
  createdBy: z.string().uuid().nullable(),
});

export const recordRemake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => RecordRemakeInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "remakes.create");
    const { handleRecordRemake } = await import("./tracking.server");
    return handleRecordRemake(data, ctx.userId);
  });

const PublicAttachmentsInput = z.object({
  token: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
});

export const getPublicOrderAttachments = createServerFn({ method: "POST" })
  .inputValidator((d) => PublicAttachmentsInput.parse(d))
  .handler(async ({ data }) => {
    const { handlePublicOrderAttachments } = await import("./tracking.server");
    return handlePublicOrderAttachments(data);
  });

const PublicAttachmentDownloadInput = z.object({
  trackingToken: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export const getPublicAttachmentDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => PublicAttachmentDownloadInput.parse(d))
  .handler(async ({ data }) => {
    const { handlePublicAttachmentDownload } = await import("./tracking.server");
    return handlePublicAttachmentDownload(data);
  });
