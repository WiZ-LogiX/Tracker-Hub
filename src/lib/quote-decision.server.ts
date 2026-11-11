import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { quotes, opportunities, tasks, auditLog } from "@/db/schema";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log } from "@/lib/log";
import { getNextTaskCode } from "@/lib/task-codes.server";

export async function handleCustomerQuoteDecisionInternal({
  quoteId,
  trackingToken,
  decision,
  notes,
  channel = "track_page",
  userId,
  freezeSnapshotFn,
}: {
  quoteId?: string;
  trackingToken?: string;
  decision: "accept" | "reject" | "revision_requested";
  notes?: string;
  channel?: string;
  userId?: string;
  freezeSnapshotFn?: (tenantId: string, quotationId: string, state: string, client: any) => Promise<void>;
}) {
  let quoteRow: any = null;

  if (quoteId) {
    const [q] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    quoteRow = q ?? null;
  } else if (trackingToken) {
    const [q] = await db
      .select()
      .from(quotes)
      .where(
        sql`${quotes.id} = ${trackingToken}::uuid OR ${quotes.snapshot}->>'tracking_token' = ${trackingToken}`,
      )
      .limit(1);
    quoteRow = q ?? null;
  }

  if (!quoteRow) {
    throw new Error("Quotation not found");
  }

  const tid = quoteRow.tenantId;
  const existingSnap = (quoteRow.snapshot || {}) as Record<string, any>;
  const nowIso = new Date().toISOString();
  const linkedOpportunityId = existingSnap.opportunityId || existingSnap.opportunity_id || quoteRow.opportunityId;

  if (quoteRow.status === "converted") {
    throw new Error("Cannot decide on quotation that has already been converted to an order");
  }

  if (decision === "accept") {
    const updatedLifecycle = {
      ...(existingSnap.lifecycle || {}),
      stage: "accepted",
      decision: "accepted",
      decision_at: nowIso,
      decision_notes: notes || null,
      decision_channel: channel,
    };

    const newSnapshot = {
      ...existingSnap,
      lifecycle: updatedLifecycle,
    };

    await db
      .update(quotes)
      .set({
        status: "accepted",
        snapshot: newSnapshot,
      })
      .where(eq(quotes.id, quoteRow.id));

    // Freeze snapshot on accepted
    if (freezeSnapshotFn) {
      try {
        await freezeSnapshotFn(tid, quoteRow.id, "accepted", supabaseAdmin);
      } catch (e) {
        log.warn("freezeQuoteSnapshot on accept warning:", { error: String(e) });
      }
    }

    // Advance opportunity to won if linked
    if (linkedOpportunityId) {
      await db
        .update(opportunities)
        .set({
          stage: "won",
          status: "won",
          value: quoteRow.total,
          lostReason: null,
          nextAction: `اعتماد عرض السعر ${quoteRow.quoteNumber} من العميل - جاهز للتحويل لأمر إنتاج`,
          nextActionDate: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.id, linkedOpportunityId), eq(opportunities.tenantId, tid)));
    }

    await db.insert(auditLog).values({
      tenantId: tid,
      actorId: userId ?? "customer",
      entityType: "quotation",
      entityId: quoteRow.id,
      action: "quote_accepted_by_customer",
      details: {
        quoteNumber: quoteRow.quoteNumber,
        channel,
        notes: notes || null,
      },
    });

    return {
      ok: true,
      status: "accepted",
      message: "تم اعتماد وقبول عرض السعر بنجاح",
    };
  } else if (decision === "reject") {
    const updatedLifecycle = {
      ...(existingSnap.lifecycle || {}),
      stage: "rejected",
      decision: "rejected",
      decision_at: nowIso,
      decision_notes: notes || null,
      decision_channel: channel,
    };

    const newSnapshot = {
      ...existingSnap,
      lifecycle: updatedLifecycle,
    };

    await db
      .update(quotes)
      .set({
        status: "rejected",
        snapshot: newSnapshot,
      })
      .where(eq(quotes.id, quoteRow.id));

    // Move opportunity to negotiation
    if (linkedOpportunityId) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 2);

      await db
        .update(opportunities)
        .set({
          stage: "negotiation",
          status: "open",
          nextAction: `مراجعة العميل بعد رفض عرض السعر ${quoteRow.quoteNumber}: ${notes || "بدون سبب مذكور"}`,
          nextActionDate: followUpDate,
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.id, linkedOpportunityId), eq(opportunities.tenantId, tid)));

      const taskCode = await getNextTaskCode(tid);
      await db.insert(tasks).values({
        tenantId: tid,
        taskCode,
        title: `مراجعة أسباب رفض عرض السعر ${quoteRow.quoteNumber}`,
        description: `رفض العميل عرض السعر رقم ${quoteRow.quoteNumber}. السبب / الملاحظات: ${notes || "لم يتم تسجيل ملاحظات"}. مطلوب المتابعة لتقديم بدائل`,
        status: "not_started",
        priority: "high",
        category: "crm_follow_up",
        dueDate: followUpDate,
        createdBy: userId ?? "00000000-0000-0000-0000-000000000000",
        customerId: quoteRow.customerId,
        quoteId: quoteRow.id,
        opportunityId: linkedOpportunityId,
      });
    }

    await db.insert(auditLog).values({
      tenantId: tid,
      actorId: userId ?? "customer",
      entityType: "quotation",
      entityId: quoteRow.id,
      action: "quote_rejected_by_customer",
      details: {
        quoteNumber: quoteRow.quoteNumber,
        channel,
        reason: notes || null,
      },
    });

    return {
      ok: true,
      status: "rejected",
      message: "تم تسجيل رفض عرض السعر",
    };
  } else if (decision === "revision_requested") {
    const history = Array.isArray(existingSnap.version_history) ? [...existingSnap.version_history] : [];
    const currentVersion = Number(existingSnap.version || history.length + 1);

    history.push({
      version: currentVersion,
      frozen_at: nowIso,
      total: Number(quoteRow.total || 0),
      revision_notes: notes || "طلب العميل تعديل عرض السعر",
    });

    const nextVersion = currentVersion + 1;

    const updatedLifecycle = {
      ...(existingSnap.lifecycle || {}),
      stage: "revision_requested",
      decision: "revision_requested",
      decision_at: nowIso,
      decision_notes: notes || null,
      decision_channel: channel,
      version_history: history,
    };

    const newSnapshot = {
      ...existingSnap,
      version: nextVersion,
      version_history: history,
      lifecycle: updatedLifecycle,
    };

    await db
      .update(quotes)
      .set({
        status: "draft",
        snapshot: newSnapshot,
      })
      .where(eq(quotes.id, quoteRow.id));

    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 1);
    const taskCode = await getNextTaskCode(tid);

    await db.insert(tasks).values({
      tenantId: tid,
      taskCode,
      title: `طلب تعديل عرض السعر ${quoteRow.quoteNumber} (إصدار V${nextVersion})`,
      description: `طلب العميل تعديل بنود عرض السعر رقم ${quoteRow.quoteNumber}. طلبات العميل: ${notes || "مراجعة المواصفات والأسعار"}`,
      status: "not_started",
      priority: "high",
      category: "crm_follow_up",
      dueDate: followUpDate,
      createdBy: userId ?? "00000000-0000-0000-0000-000000000000",
      customerId: quoteRow.customerId,
      quoteId: quoteRow.id,
      opportunityId: linkedOpportunityId || null,
    });

    await db.insert(auditLog).values({
      tenantId: tid,
      actorId: userId ?? "customer",
      entityType: "quotation",
      entityId: quoteRow.id,
      action: "quote_revision_requested_by_customer",
      details: {
        quoteNumber: quoteRow.quoteNumber,
        channel,
        version: nextVersion,
        revisionNotes: notes || null,
      },
    });

    return {
      ok: true,
      status: "revision_requested",
      version: nextVersion,
      message: "تم تسجيل طلب التعديل بنجاح وجارٍ مراجعته من قبل فريق المبيعات",
    };
  }

  throw new Error("Invalid decision");
}
