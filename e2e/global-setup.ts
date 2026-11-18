import { db } from "../src/db/client.server";
import {
  tenants,
  appUsers,
  tenantMembers,
  tenantRoles,
  rolePermissions,
  customers,
  quotes,
  quoteItems,
  orders,
  invoices,
  projects,
  deliveryHandovers,
  leads,
  opportunities,
  tasks,
  serviceCases,
} from "../src/db/schema";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/tenant-permissions-data";

export default async function globalSetup() {
  console.log("[E2E Global Setup] Seeding idempotent test baseline into localhost:5433/pelecanon_test...");

  const testTenantId = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const adminUserId = "3577b1a6-5c6e-4e67-b09a-e0e97ab92739";
  const workerUserId = "44444444-4444-4444-4444-444444444444";
  const customerSherifId = "33333333-3333-3333-3333-333333333331";
  const customerNuhaId = "33333333-3333-3333-3333-333333333332";

  const quoteDcdId = "603d3f00-0895-4cf1-9d08-6e50987e6c42";
  const quoteNuhaId = "b36acb62-f1f7-42ee-831c-6947fca97079";
  const quoteRestorationId = "88888888-8888-8888-8888-888888888881";
  const orderDcdId = "d08c8068-5627-4fe7-bf59-09756495cd7d";
  const orderNuhaId = "e11166ae-cc4f-4f36-a791-ebb7eea122da";
  const orderRestorationId = "55555555-5555-5555-5555-555555555551";
  const invoiceDcdId = "219ae124-6eea-413e-9b0b-917ccd3b1c19";
  const invoiceRestorationId = "66666666-6666-6666-6666-666666666661";
  const projectDcdId = "dd17f6a4-6f28-498c-8f95-875c06f475c9";
  const deliveryDcdId = "bae27b12-8371-40c3-ad64-3e1145246299";

  try {
    // 1. Tenant
    await db
      .insert(tenants)
      .values({
        id: testTenantId,
        slug: "pelecanon",
        name: "PeleCanon",
      })
      .onConflictDoNothing();

    // 2. App Users
    await db
      .insert(appUsers)
      .values([
        {
          id: adminUserId,
          tenantId: testTenantId,
          username: "admin",
          displayName: "مدير النظام (Admin)",
          status: "active",
        },
        {
          id: workerUserId,
          tenantId: testTenantId,
          username: "worker1",
          displayName: "فني المهام (Worker)",
          status: "active",
        },
      ])
      .onConflictDoNothing();

    // 3. Tenant Members
    await db
      .insert(tenantMembers)
      .values([
        {
          tenantId: testTenantId,
          userId: adminUserId,
          role: "owner",
        },
        {
          tenantId: testTenantId,
          userId: workerUserId,
          role: "worker",
        },
      ])
      .onConflictDoNothing();

    // 4. Predefined Tenant Roles & Saved Permissions
    const rolesToSeed = [
      { slug: "admin", label: "مدير النظام (Administrator)", perms: DEFAULT_ROLE_PERMISSIONS.admin },
      { slug: "sales", label: "مشرف العمليات (Manager)", perms: DEFAULT_ROLE_PERMISSIONS.sales },
      { slug: "worker", label: "فني المهام (Task Worker)", perms: DEFAULT_ROLE_PERMISSIONS.worker },
      { slug: "viewer", label: "مشاهد (Viewer)", perms: DEFAULT_ROLE_PERMISSIONS.viewer },
    ];

    for (const r of rolesToSeed) {
      await db
        .insert(tenantRoles)
        .values({
          tenantId: testTenantId,
          slug: r.slug,
          label: r.label,
          description: "تمت التهيئة التلقائية للأدوار الافتراضية",
        })
        .onConflictDoNothing();

      if (r.perms && r.perms.length > 0) {
        const rows = r.perms.map((slug) => ({
          tenantId: testTenantId,
          role: r.slug,
          permissionSlug: slug,
        }));
        await db.insert(rolePermissions).values(rows).onConflictDoNothing();
      }
    }

    // 5. Customers
    await db
      .insert(customers)
      .values([
        {
          id: customerSherifId,
          tenantId: testTenantId,
          name: "م. شريف المنشاوي",
          phone: "01099887766",
          email: "sherif@example.com",
        },
        {
          id: customerNuhaId,
          tenantId: testTenantId,
          name: "Nuha Mansour",
          phone: "01011223344",
          email: "nuha@example.com",
        },
      ])
      .onConflictDoNothing();

    // 6. Quotes
    await db
      .insert(quotes)
      .values([
        {
          id: quoteDcdId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteNumber: "PLC-DCD02",
          legacyQuoteNumber: "PLC-TRX-2026-01",
          status: "accepted",
          subtotal: "185000",
          total: "185000",
          validUntil: "2026-12-31",
          snapshot: {
            customerName: "م. شريف المنشاوي",
            customerPhone: "01099887766",
            customerEmail: "sherif@example.com",
            quoteNumber: "PLC-DCD02",
            legacyQuoteNumber: "PLC-TRX-2026-01",
            projectNumber: "PRJ-DCD02",
            orderNumber: "PLC-DCD02",
            deliveryNumber: "DEL-TRX-2026-01",
            invoiceNumber: "PLC-DCD02",
            items: [
              {
                id: "item-1",
                name: "صالون فاخر خشب زان طبيعي",
                quantity: 1,
                unitPrice: 185000,
                lineTotal: 185000,
              },
            ],
          },
        },
        {
          id: quoteNuhaId,
          tenantId: testTenantId,
          customerId: customerNuhaId,
          quoteNumber: "PLC-5NIEJ",
          status: "sent",
          subtotal: "120000",
          total: "120000",
          validUntil: "2026-12-31",
          snapshot: {
            tracking_token: quoteNuhaId,
            customerName: "Nuha Mansour",
            customerPhone: "01011223344",
            customerEmail: "nuha@example.com",
            quoteNumber: "PLC-5NIEJ",
            items: [
              {
                id: "item-nuha-1",
                name: "غرفة نوم ماستر مودرن",
                quantity: 1,
                unitPrice: 120000,
                lineTotal: 120000,
              },
            ],
          },
        },
        {
          id: quoteRestorationId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteNumber: "PLC-00100",
          status: "draft",
          subtotal: "92000",
          total: "92000",
          validUntil: "2026-12-31",
          snapshot: {
            quotationMode: "commercial",
            customerName: "م. شريف المنشاوي",
            customerPhone: "01099887766",
            quoteNumber: "PLC-00100",
            lines: [
              {
                id: "line-restoration-1",
                name: "مطبخ أرو مودرن",
                category: "kitchen",
                categoryNameAr: "مطابخ",
                pricingUnitAr: "متر طولي",
                dimensions: { width: 450, height: 220, depth: 60, unit: "سم" },
                quantity: 1,
                unitPrice: 92000,
                lineTotal: 92000,
                technicalSpecs: "مطبخ خشب أرو طبيعي مع إكسسوارات بلوم",
              },
            ],
            subtotal: 92000,
            total: 92000,
            terms: {
              deliveryDays: 45,
              warrantyYears: 10,
              paymentSchedule: [
                { percent: 60, timing: "Advance", timingAr: "مقدم عند التعاقد" },
                { percent: 30, timing: "Middle", timingAr: "بعد التعاقد بـ 15 يوم" },
                { percent: 10, timing: "Final", timingAr: "عند الاستلام والتركيب" },
              ],
              notes: ["شامل المقابض والمفصلات بلوم النمساوية", "ضمان 10 سنوات"],
            },
          },
        },
      ])
      .onConflictDoNothing();

    // 7. Quote Items
    await db
      .insert(quoteItems)
      .values([
        {
          id: "77777777-7777-4777-8777-777777777771",
          tenantId: testTenantId,
          quoteId: quoteDcdId,
          productName: "صالون فاخر خشب زان طبيعي",
          qty: 1,
          unitPrice: "185000",
          lineTotal: "185000",
        },
        {
          id: "88888888-8888-4888-8888-888888888881",
          tenantId: testTenantId,
          quoteId: quoteRestorationId,
          productName: "مطبخ أرو مودرن",
          qty: 1,
          unitPrice: "92000",
          lineTotal: "92000",
          materialName: "مطابخ",
          finishName: "متر طولي",
          dimensionValue: "450",
          breakdown: {
            category: "kitchen",
            categoryNameAr: "مطابخ",
            technicalSpecs: "مطبخ خشب أرو طبيعي مع إكسسوارات بلوم",
            dimensions: { width: 450, height: 220, depth: 60, unit: "سم" },
          },
        },
      ])
      .onConflictDoNothing();

    // 8. Orders
    await db
      .insert(orders)
      .values([
        {
          id: orderDcdId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteId: quoteDcdId,
          orderNumber: "PLC-DCD02",
          currentStage: "assembly",
          total: "185000",
          deposit: "92500",
          contractDate: "2026-11-01",
        },
        {
          id: orderNuhaId,
          tenantId: testTenantId,
          customerId: customerNuhaId,
          trackingToken: orderNuhaId,
          orderNumber: "PLC-KR721",
          currentStage: "cutting",
          total: "120000",
          deposit: "60000",
          contractDate: "2026-11-01",
        },
        {
          id: orderRestorationId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteId: quoteRestorationId,
          orderNumber: "PLC-00100",
          currentStage: "deposit_received",
          total: "92000",
          deposit: "55200",
          contractDate: "2026-09-02",
        },
      ])
      .onConflictDoNothing();

    // 9. Invoices
    await db
      .insert(invoices)
      .values([
        {
          id: invoiceDcdId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteId: quoteDcdId,
          invoiceNumber: "PLC-DCD02",
          total: "185000",
          depositAmount: "92500",
          paidAmount: "92500",
        },
        {
          id: invoiceRestorationId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteId: quoteRestorationId,
          invoiceNumber: "PLC-00100",
          total: "92000",
          depositAmount: "55200",
          paidAmount: "55200",
        },
      ])
      .onConflictDoNothing();

    // 10. Projects
    await db
      .insert(projects)
      .values([
        {
          id: projectDcdId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          quoteId: quoteDcdId,
          orderId: orderDcdId,
          projectNumber: "PRJ-DCD02",
          title: "صالون وطعام فاخر - مشروع المنشاوي",
          status: "active",
          currentStage: "assembly",
          totalValue: "185000",
        },
      ])
      .onConflictDoNothing();

    // 11. Deliveries
    await db
      .insert(deliveryHandovers)
      .values([
        {
          id: deliveryDcdId,
          tenantId: testTenantId,
          customerId: customerSherifId,
          orderId: orderDcdId,
          deliveryNumber: "DEL-TRX-2026-01",
          status: "completed",
          deliveryAddress: "التجمع الخامس، القاهرة الجديدة",
          recipientName: "م. شريف المنشاوي",
          recipientPhone: "01099887766",
        },
      ])
      .onConflictDoNothing();

    // 12. CRM Leads & Opportunities
    await db
      .insert(leads)
      .values([
        {
          id: "22222222-2222-4222-8222-222222222221",
          tenantId: testTenantId,
          leadNumber: "LD-2026-0001",
          name: "أحمد محمود",
          phone: "01012345678",
          source: "website",
          status: "new",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(opportunities)
      .values([
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenantId: testTenantId,
          customerId: customerSherifId,
          opportunityNumber: "OPP-2026-0012",
          title: "فيلا الشيخ زايد - تشطيب كامل",
          value: "185000",
          stage: "quotation",
        },
      ])
      .onConflictDoNothing();

    // 13. Tasks
    await db
      .insert(tasks)
      .values([
        {
          id: "88888888-8888-4888-8888-888888888881",
          tenantId: testTenantId,
          taskCode: "TSK-2026-0001",
          title: "مراجعة مواصفات صالون المنشاوي",
          status: "in_progress",
          priority: "high",
          category: "production",
          createdBy: adminUserId,
          customerId: customerSherifId,
          quoteId: quoteDcdId,
          orderId: orderDcdId,
        },
      ])
      .onConflictDoNothing();

    // 14. Service Cases (After Sales)
    await db
      .insert(serviceCases)
      .values([
        {
          id: "99999999-9999-4999-8999-999999999991",
          tenantId: testTenantId,
          caseNumber: "SRV-2026-0001",
          customerId: customerSherifId,
          orderId: orderDcdId,
          deliveryId: deliveryDcdId,
          title: "صيانة دورية ومتابعة تركيب",
          type: "maintenance",
          priority: "medium",
          status: "new",
        },
      ])
      .onConflictDoNothing();

    console.log("[E2E Global Setup] Baseline seeded successfully.");
  } catch (err) {
    console.error("[E2E Global Setup] Seeding error:", err);
  }
}
