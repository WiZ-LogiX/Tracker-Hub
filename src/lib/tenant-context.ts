/**
 * Unified Tenant context, RBAC & Permissions Engine for PeleCanon.
 *
 * Implements the single source of truth for Role-Based Access Control:
 * User -> Tenant Membership -> Assigned Role -> Saved Role Permissions.
 *
 * Predefined Profiles:
 *   - Administrator (admin)
 *   - Manager (sales)
 *   - Task Worker (worker)
 * Reserved System Roles:
 *   - Owner (owner): Immutable super-administrator with unconditional bypass
 *   - Viewer (viewer): Backward-compatible read-only profile
 * Custom Roles:
 *   - Tenant-scoped roles with independent slugs and configurable permissions.
 */



/** The 5 built-in role slugs (cannot be deleted). */
export const BUILTIN_ROLE_SLUGS = [
  "owner",
  "admin",
  "sales",
  "worker",
  "viewer",
] as const;

/** A role is a string slug (built-in or custom). */
export type TenantRole = string;

/** All 121 known permission slugs across all 22 ERP sections. */
export const ALL_PERMISSION_SLUGS = [
  // Dashboard
  "dashboard.view",

  // CRM & Pipeline
  "crm.view",
  "crm.leads.create",
  "crm.leads.edit",
  "crm.leads.delete",
  "crm.opportunities.create",
  "crm.opportunities.edit",
  "crm.opportunities.delete",
  "crm.stage.change",
  "crm.convert",
  "crm.assign",
  "crm.sales_workspace.view",
  "crm.activities.log",
  "crm.sales_workspace.manage",
  "crm.analytics.view",

  // Quotations
  "quotes.view",
  "quotes.create",
  "quotes.edit",
  "quotes.delete",
  "quotes.configurator",
  "quotes.approve",
  "quotes.convert",

  // Projects
  "projects.view",
  "projects.create",
  "projects.edit",
  "projects.delete",
  "projects.manage",
  "projects.financials.view",

  // Production Orders
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.delete",
  "orders.stage.change",

  // Deliveries
  "deliveries.view",
  "deliveries.create",
  "deliveries.edit",
  "deliveries.status.update",

  // Invoices & Payments
  "invoices.view",
  "invoices.create",
  "invoices.edit",
  "invoices.delete",
  "invoices.payments.record",

  // Tasks
  "tasks.view_assigned",
  "tasks.view_all",
  "tasks.create",
  "tasks.edit",
  "tasks.status.transition",
  "tasks.notes.add",
  "tasks.attachments.upload",
  "tasks.assign",
  "tasks.acknowledge",
  "tasks.bulk",

  // Cost Analysis
  "cost-analysis.view",
  "cost-analysis.edit",

  // After-Sales
  "after-sales.view",
  "after-sales.create",
  "after-sales.edit",
  "after-sales.status.update",
  "after-sales.assign",
  "after-sales.delete",

  // Discounts
  "discounts.view",
  "discounts.create",
  "discounts.edit",
  "discounts.delete",

  // Customers
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.delete",

  // Products & Materials (Catalog)
  "products.view",
  "products.create",
  "products.edit",
  "products.delete",
  "materials.view",
  "materials.create",
  "materials.edit",
  "materials.delete",
  "suppliers.view",
  "suppliers.create",
  "suppliers.edit",
  "suppliers.delete",
  "finishes.view",
  "finishes.create",
  "finishes.edit",
  "finishes.delete",
  "veneers.view",
  "veneers.create",
  "veneers.edit",
  "veneers.delete",
  "accessories.view",
  "accessories.create",
  "accessories.edit",
  "accessories.delete",
  "pricing.view",
  "pricing.edit",

  // Inventory
  "inventory.view",
  "inventory.create",
  "inventory.edit",
  "inventory.adjust",
  "inventory.delete",

  // Work Orders
  "work-orders.view",
  "work-orders.create",
  "work-orders.status.update",
  "work-orders.assign",
  "work-orders.delete",

  // Shop Floor Workers
  "workers.view",
  "workers.create",
  "workers.edit",
  "workers.delete",

  // Remakes
  "remakes.view",
  "remakes.create",
  "remakes.edit",
  "remakes.delete",

  // Team Management
  "team.view",
  "team.manage",

  // Notifications
  "notifications.view",
  "notifications.send",
  "notifications.templates.manage",

  // System Settings
  "settings.view",
  "settings.manage",

  // Seed
  "seed.view",
  "seed.manage",
] as const;

export type PermissionSlug = (typeof ALL_PERMISSION_SLUGS)[number];

/** Result of resolving the request → tenant binding. */
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
  permissions?: Set<string>;
}

/** A permission set loaded from the role_permissions table. */
export interface UserPermissions {
  role: TenantRole;
  permissions: Set<string>;
}

/** A tenant role row from the DB. */
export interface TenantRoleInfo {
  slug: string;
  label: string;
  description: string | null;
}

/* ──────────────────────────────────────────────────────────────────────────
   Canonical Default Permissions for Built-in Profiles (Fallback when unseeded)
   ────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  // Owner: unconditional full access bypass
  owner: [...ALL_PERMISSION_SLUGS],

  // Administrator: Full access across all 22 sections & special access
  admin: [...ALL_PERMISSION_SLUGS],

  // Manager (sales): Operational & Commercial oversight
  sales: [
    "dashboard.view",
    "crm.view", "crm.leads.create", "crm.leads.edit", "crm.opportunities.create", "crm.opportunities.edit",
    "crm.stage.change", "crm.convert", "crm.assign", "crm.sales_workspace.view", "crm.activities.log",
    "quotes.view", "quotes.create", "quotes.edit", "quotes.configurator", "quotes.approve", "quotes.convert",
    "projects.view", "projects.create", "projects.edit", "projects.manage", "projects.financials.view",
    "orders.view", "orders.create", "orders.edit", "orders.stage.change",
    "deliveries.view", "deliveries.create", "deliveries.edit", "deliveries.status.update",
    "invoices.view", "invoices.create", "invoices.edit", "invoices.payments.record",
    "tasks.view_all", "tasks.create", "tasks.edit", "tasks.status.transition", "tasks.notes.add",
    "tasks.attachments.upload", "tasks.assign", "tasks.acknowledge", "tasks.bulk",
    "cost-analysis.view", "crm.analytics.view",
    "after-sales.view", "after-sales.create", "after-sales.edit", "after-sales.status.update", "after-sales.assign",
    "discounts.view", "discounts.create", "discounts.edit",
    "customers.view", "customers.create", "customers.edit",
    "products.view", "materials.view", "suppliers.view", "finishes.view", "veneers.view", "accessories.view",
    "inventory.view", "inventory.adjust",
    "work-orders.view", "work-orders.create", "work-orders.status.update", "work-orders.assign",
    "workers.view", "remakes.view", "remakes.create", "remakes.edit",
    "notifications.view", "notifications.send", "settings.view",
  ],

  // Task Worker (worker): strictly scoped to assigned work & progress updates
  worker: [
    "tasks.view_assigned",
    "tasks.status.transition",
    "tasks.notes.add",
    "tasks.attachments.upload",
    "notifications.view",
  ],

  // Viewer (viewer): strictly read-only across all modules
  viewer: ALL_PERMISSION_SLUGS.filter((s) => s.includes(".view")),
};

/* ──────────────────────────────────────────────────────────────────────────
   The 22 Application Sections Registry & 4 Access Levels Mappings
   ────────────────────────────────────────────────────────────────────────── */

export type SimpleAccessLevel = "none" | "view" | "work" | "manage";

export interface SectionMeta {
  id: string;
  category: "core" | "catalog" | "system";
  titleKey: string;
  descKey: string;
  defaultTitle: string;
  defaultDesc: string;
  iconName: string;
  route: string;
  viewPerms: string[];
  workPerms: string[];
  managePerms: string[];
}

export const APPLICATION_SECTIONS: SectionMeta[] = [
  // ── CORE OPERATIONS (14) ──
  {
    id: "dashboard",
    category: "core",
    titleKey: "admin.nav.home",
    descKey: "admin.rbac.descDashboard",
    defaultTitle: "لوحة التحكم الرئيسية",
    defaultDesc: "المؤشرات التشغيلية ونظرة عامة على أعمال الورشة",
    iconName: "LayoutDashboard",
    route: "/admin",
    viewPerms: ["dashboard.view"],
    workPerms: ["dashboard.view"],
    managePerms: ["dashboard.view"],
  },
  {
    id: "crm",
    category: "core",
    titleKey: "admin.nav.crm",
    descKey: "admin.rbac.descCrm",
    defaultTitle: "إدارة علاقات العملاء وخط المبيعات",
    defaultDesc: "متابعة العملاء المحتملين وتطور الفرص البيعية",
    iconName: "TrendingUp",
    route: "/admin/crm",
    viewPerms: ["crm.view"],
    workPerms: [
      "crm.view",
      "crm.leads.create",
      "crm.leads.edit",
      "crm.opportunities.create",
      "crm.opportunities.edit",
      "crm.stage.change",
    ],
    managePerms: [
      "crm.view",
      "crm.leads.create",
      "crm.leads.edit",
      "crm.leads.delete",
      "crm.opportunities.create",
      "crm.opportunities.edit",
      "crm.opportunities.delete",
      "crm.stage.change",
      "crm.assign",
    ],
  },
  {
    id: "crm_sales",
    category: "core",
    titleKey: "admin.nav.salesWorkspace",
    descKey: "admin.rbac.descSalesWorkspace",
    defaultTitle: "مساحة عمل المبيعات",
    defaultDesc: "المتابعة اليومية للمكالمات والأنشطة البيعية والمهام",
    iconName: "UserCheck",
    route: "/admin/crm/sales",
    viewPerms: ["crm.sales_workspace.view"],
    workPerms: ["crm.sales_workspace.view", "crm.activities.log"],
    managePerms: [
      "crm.sales_workspace.view",
      "crm.activities.log",
      "crm.sales_workspace.manage",
    ],
  },
  {
    id: "quotes",
    category: "core",
    titleKey: "admin.nav.quotes",
    descKey: "admin.rbac.descQuotes",
    defaultTitle: "عروض الأسعار والتسعير",
    defaultDesc: "إنشاء وحساب وتعديل المقايسات وعروض الأسعار",
    iconName: "FileText",
    route: "/admin/quotes",
    viewPerms: ["quotes.view"],
    workPerms: [
      "quotes.view",
      "quotes.create",
      "quotes.edit",
      "quotes.configurator",
    ],
    managePerms: [
      "quotes.view",
      "quotes.create",
      "quotes.edit",
      "quotes.configurator",
    ],
  },
  {
    id: "projects",
    category: "core",
    titleKey: "admin.nav.projects",
    descKey: "admin.rbac.descProjects",
    defaultTitle: "إدارة المشاريع",
    defaultDesc: "مساحة عمل وتنسيق المشاريع الشاملة ومراحل التنفيذ",
    iconName: "FolderKanban",
    route: "/admin/projects",
    viewPerms: ["projects.view"],
    workPerms: ["projects.view", "projects.create", "projects.edit"],
    managePerms: [
      "projects.view",
      "projects.create",
      "projects.edit",
      "projects.manage",
    ],
  },
  {
    id: "orders",
    category: "core",
    titleKey: "admin.nav.orders",
    descKey: "admin.rbac.descOrders",
    defaultTitle: "أوامر الإنتاج",
    defaultDesc: "تتبع خطوط الإنتاج والجدول الزمني للورشة",
    iconName: "ClipboardList",
    route: "/admin/orders",
    viewPerms: ["orders.view"],
    workPerms: ["orders.view", "orders.create", "orders.edit"],
    managePerms: ["orders.view", "orders.create", "orders.edit"],
  },
  {
    id: "deliveries",
    category: "core",
    titleKey: "admin.nav.deliveries",
    descKey: "admin.rbac.descDeliveries",
    defaultTitle: "الشحن والتسليم",
    defaultDesc: "إصدار أذونات التسليم ومحاضر التركيب الميداني",
    iconName: "Truck",
    route: "/admin/deliveries",
    viewPerms: ["deliveries.view"],
    workPerms: [
      "deliveries.view",
      "deliveries.create",
      "deliveries.edit",
    ],
    managePerms: [
      "deliveries.view",
      "deliveries.create",
      "deliveries.edit",
    ],
  },
  {
    id: "invoices",
    category: "core",
    titleKey: "admin.nav.invoices",
    descKey: "admin.rbac.descInvoices",
    defaultTitle: "الفواتير والمدفوعات",
    defaultDesc: "إصدار الفواتير ومتابعة سندات السداد والدفعات",
    iconName: "Receipt",
    route: "/admin/invoices",
    viewPerms: ["invoices.view"],
    workPerms: ["invoices.view", "invoices.create", "invoices.edit"],
    managePerms: ["invoices.view", "invoices.create", "invoices.edit"],
  },
  {
    id: "tasks",
    category: "core",
    titleKey: "admin.nav.tasks",
    descKey: "admin.rbac.descTasks",
    defaultTitle: "إدارة المهام الميدانية",
    defaultDesc: "متابعة وتحديث مهام التصنيع والتركيب والملاحظات",
    iconName: "CheckSquare",
    route: "/admin/tasks",
    viewPerms: ["tasks.view_assigned"],
    workPerms: [
      "tasks.view_assigned",
      "tasks.status.transition",
      "tasks.notes.add",
      "tasks.attachments.upload",
    ],
    managePerms: [
      "tasks.view_all",
      "tasks.create",
      "tasks.edit",
      "tasks.status.transition",
      "tasks.notes.add",
      "tasks.attachments.upload",
      "tasks.bulk",
    ],
  },
  {
    id: "cost_analysis",
    category: "core",
    titleKey: "admin.nav.costAnalysis",
    descKey: "admin.rbac.descCostAnalysis",
    defaultTitle: "تحليل التكاليف",
    defaultDesc: "دراسة تكاليف الخامات والعمالة وهوامش الربح",
    iconName: "BarChart3",
    route: "/admin/cost-analysis",
    viewPerms: ["cost-analysis.view"],
    workPerms: ["cost-analysis.view", "cost-analysis.edit"],
    managePerms: ["cost-analysis.view", "cost-analysis.edit"],
  },
  {
    id: "crm_analytics",
    category: "core",
    titleKey: "admin.nav.crmAnalytics",
    descKey: "admin.rbac.descCrmAnalytics",
    defaultTitle: "تحليلات المبيعات وCRM",
    defaultDesc: "تقارير أداء المبيعات ومعدلات الإغلاق والتحويل",
    iconName: "BarChart3",
    route: "/admin/crm/analytics",
    viewPerms: ["crm.analytics.view"],
    workPerms: ["crm.analytics.view"],
    managePerms: ["crm.analytics.view"],
  },
  {
    id: "after_sales",
    category: "core",
    titleKey: "admin.nav.afterSales",
    descKey: "admin.rbac.descAfterSales",
    defaultTitle: "خدمات ما بعد البيع",
    defaultDesc: "متابعة بلاغات الصيانة والضمان ورضا العملاء",
    iconName: "Headphones",
    route: "/admin/crm/after-sales",
    viewPerms: ["after-sales.view"],
    workPerms: [
      "after-sales.view",
      "after-sales.create",
      "after-sales.edit",
      "after-sales.status.update",
    ],
    managePerms: [
      "after-sales.view",
      "after-sales.create",
      "after-sales.edit",
      "after-sales.status.update",
      "after-sales.assign",
      "after-sales.delete",
    ],
  },
  {
    id: "discounts",
    category: "core",
    titleKey: "admin.nav.discounts",
    descKey: "admin.rbac.descDiscounts",
    defaultTitle: "الخصومات والعروض",
    defaultDesc: "إدارة وتطبيق أكواد الخصومات الترويجية",
    iconName: "Ticket",
    route: "/admin/discounts",
    viewPerms: ["discounts.view"],
    workPerms: ["discounts.view", "discounts.create", "discounts.edit"],
    managePerms: [
      "discounts.view",
      "discounts.create",
      "discounts.edit",
      "discounts.delete",
    ],
  },
  {
    id: "customers",
    category: "core",
    titleKey: "admin.nav.customers",
    descKey: "admin.rbac.descCustomers",
    defaultTitle: "دليل العملاء",
    defaultDesc: "سجلات العملاء وتفاصيل الاتصال والعناوين",
    iconName: "UserCircle",
    route: "/admin/customers",
    viewPerms: ["customers.view"],
    workPerms: ["customers.view", "customers.create", "customers.edit"],
    managePerms: ["customers.view", "customers.create", "customers.edit"],
  },

  // ── CATALOG & PRODUCTION (5) ──
  {
    id: "products",
    category: "catalog",
    titleKey: "admin.nav.products",
    descKey: "admin.rbac.descProducts",
    defaultTitle: "كتالوج المنتجات والمواد",
    defaultDesc: "الأصناف القياسية، الخامات، الموردين، والتشطيبات",
    iconName: "Package",
    route: "/admin/products",
    viewPerms: [
      "products.view",
      "materials.view",
      "suppliers.view",
      "finishes.view",
      "veneers.view",
      "accessories.view",
      "pricing.view",
    ],
    workPerms: [
      "products.view",
      "products.create",
      "products.edit",
      "materials.view",
      "materials.create",
      "materials.edit",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "finishes.view",
      "finishes.create",
      "finishes.edit",
      "veneers.view",
      "veneers.create",
      "veneers.edit",
      "accessories.view",
      "accessories.create",
      "accessories.edit",
      "pricing.view",
    ],
    managePerms: [
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "materials.view",
      "materials.create",
      "materials.edit",
      "materials.delete",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "suppliers.delete",
      "finishes.view",
      "finishes.create",
      "finishes.edit",
      "finishes.delete",
      "veneers.view",
      "veneers.create",
      "veneers.edit",
      "veneers.delete",
      "accessories.view",
      "accessories.create",
      "accessories.edit",
      "accessories.delete",
      "pricing.view",
      "pricing.edit",
    ],
  },
  {
    id: "inventory",
    category: "catalog",
    titleKey: "admin.nav.inventory",
    descKey: "admin.rbac.descInventory",
    defaultTitle: "إدارة المخزون والمستودع",
    defaultDesc: "أرصدة الخامات، التسويات الجردية، وحجز المواد",
    iconName: "Boxes",
    route: "/admin/inventory",
    viewPerms: ["inventory.view"],
    workPerms: ["inventory.view", "inventory.adjust"],
    managePerms: [
      "inventory.view",
      "inventory.create",
      "inventory.edit",
      "inventory.adjust",
      "inventory.delete",
    ],
  },
  {
    id: "work_orders",
    category: "catalog",
    titleKey: "admin.nav.workOrders",
    descKey: "admin.rbac.descWorkOrders",
    defaultTitle: "أوامر التشغيل وبطاقات القص",
    defaultDesc: "أوامر التشغيل الميدانية والقص وتوزيع المحطات",
    iconName: "Hammer",
    route: "/admin/work-orders",
    viewPerms: ["work-orders.view"],
    workPerms: [
      "work-orders.view",
      "work-orders.create",
      "work-orders.status.update",
    ],
    managePerms: [
      "work-orders.view",
      "work-orders.create",
      "work-orders.status.update",
      "work-orders.assign",
      "work-orders.delete",
    ],
  },
  {
    id: "workers",
    category: "catalog",
    titleKey: "admin.nav.workers",
    descKey: "admin.rbac.descWorkers",
    defaultTitle: "طاقم فنيي الورشة",
    defaultDesc: "دليل عمال وفنيي الإنتاج والمهارات التشغيلية",
    iconName: "Users",
    route: "/admin/workers",
    viewPerms: ["workers.view"],
    workPerms: ["workers.view", "workers.create", "workers.edit"],
    managePerms: [
      "workers.view",
      "workers.create",
      "workers.edit",
      "workers.delete",
    ],
  },
  {
    id: "remakes",
    category: "catalog",
    titleKey: "admin.nav.remakes",
    descKey: "admin.rbac.descRemakes",
    defaultTitle: "إعادة التصنيع والعيوب",
    defaultDesc: "تسجيل عيوب الجودة وطلبات إعادة تصنيع القطع",
    iconName: "RefreshCcw",
    route: "/admin/remakes",
    viewPerms: ["remakes.view"],
    workPerms: ["remakes.view", "remakes.create", "remakes.edit"],
    managePerms: [
      "remakes.view",
      "remakes.create",
      "remakes.edit",
      "remakes.delete",
    ],
  },

  // ── SYSTEM & ADMINISTRATION (3) ──
  {
    id: "team",
    category: "system",
    titleKey: "admin.nav.teamManagement",
    descKey: "admin.rbac.descTeam",
    defaultTitle: "إدارة الفريق والصلاحيات",
    defaultDesc: "إدارة حسابات الموظفين وملفات الصلاحيات والأدوار",
    iconName: "UserCog",
    route: "/admin/team",
    viewPerms: ["team.view"],
    workPerms: ["team.view"],
    managePerms: ["team.view", "team.manage"],
  },
  {
    id: "notifications",
    category: "system",
    titleKey: "admin.nav.notifications",
    descKey: "admin.rbac.descNotifications",
    defaultTitle: "مركز الإشعارات والرسائل",
    defaultDesc: "إرسال التنبيهات وإدارة قوالب رسائل الواتساب والنظام",
    iconName: "Bell",
    route: "/admin/notifications",
    viewPerms: ["notifications.view"],
    workPerms: ["notifications.view", "notifications.send"],
    managePerms: [
      "notifications.view",
      "notifications.send",
      "notifications.templates.manage",
    ],
  },
  {
    id: "settings",
    category: "system",
    titleKey: "admin.nav.settings",
    descKey: "admin.rbac.descSettings",
    defaultTitle: "إعدادات النظام والشركة",
    defaultDesc: "بيانات الشركة، العملة، الضريبة، والثوابت المحاسبية",
    iconName: "Settings",
    route: "/admin/settings",
    viewPerms: ["settings.view"],
    workPerms: ["settings.view"],
    managePerms: ["settings.view", "settings.manage"],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   Special Sensitive Access Controls
   ────────────────────────────────────────────────────────────────────────── */

export interface SpecialAccessItem {
  id: string;
  category: "commercial" | "financial" | "projects" | "operations" | "system";
  slug: string;
  titleKey: string;
  descKey: string;
  defaultTitle: string;
  defaultDesc: string;
}

export const SPECIAL_ACCESS_ITEMS: SpecialAccessItem[] = [
  // Commercial
  {
    id: "quote_approve",
    category: "commercial",
    slug: "quotes.approve",
    titleKey: "admin.rbac.special.quoteApprove",
    descKey: "admin.rbac.special.quoteApproveDesc",
    defaultTitle: "اعتماد عروض الأسعار تجارياً",
    defaultDesc: "صلاحية الموافقة التجارية النهائية لنقل عرض السعر إلى مرحلة التعاقد والإنتاج",
  },
  {
    id: "quote_convert",
    category: "commercial",
    slug: "quotes.convert",
    titleKey: "admin.rbac.special.quoteConvert",
    descKey: "admin.rbac.special.quoteConvertDesc",
    defaultTitle: "تحويل عروض الأسعار إلى أوامر إنتاج",
    defaultDesc: "تحويل المقايسة المعتمدة آلياً إلى مشروع رسمي وأمر تشغيل لخط الإنتاج",
  },
  {
    id: "quote_delete",
    category: "commercial",
    slug: "quotes.delete",
    titleKey: "admin.rbac.special.quoteDelete",
    descKey: "admin.rbac.special.quoteDeleteDesc",
    defaultTitle: "حذف عروض الأسعار",
    defaultDesc: "حذف سجل المقايسة نهائياً من قاعدة بيانات الشركة",
  },
  {
    id: "discounts_delete",
    category: "commercial",
    slug: "discounts.delete",
    titleKey: "admin.rbac.special.discountsDelete",
    descKey: "admin.rbac.special.discountsDeleteDesc",
    defaultTitle: "حذف وإلغاء أكواد الخصومات",
    defaultDesc: "إلغاء أكواد الخصومات وقواعد الأسعار الترويجية المعتمدة",
  },

  // Financial
  {
    id: "financials_view",
    category: "financial",
    slug: "projects.financials.view",
    titleKey: "admin.rbac.special.financialsView",
    descKey: "admin.rbac.special.financialsViewDesc",
    defaultTitle: "الاطلاع على الأرقام المالية الحساسة",
    defaultDesc: "عرض إجمالي عقود المشاريع، هوامش الربح، وأرصدة الفواتير غير المسددة",
  },
  {
    id: "payments_record",
    category: "financial",
    slug: "invoices.payments.record",
    titleKey: "admin.rbac.special.paymentsRecord",
    descKey: "admin.rbac.special.paymentsRecordDesc",
    defaultTitle: "تسجيل وإثبات الدفعات المالية",
    defaultDesc: "إثبات استلام الدفعات النقدية والبنكية وتحديث أرصدة الفواتير المتبقية",
  },
  {
    id: "invoices_delete",
    category: "financial",
    slug: "invoices.delete",
    titleKey: "admin.rbac.special.invoicesDelete",
    descKey: "admin.rbac.special.invoicesDeleteDesc",
    defaultTitle: "حذف السجلات المحاسبية والفواتير",
    defaultDesc: "حذف الفواتير وسجلات السداد المالية من النظام",
  },

  // Projects
  {
    id: "projects_delete",
    category: "projects",
    slug: "projects.delete",
    titleKey: "admin.rbac.special.projectsDelete",
    descKey: "admin.rbac.special.projectsDeleteDesc",
    defaultTitle: "حذف سجلات المشاريع",
    defaultDesc: "حذف سجل المشروع بالكامل من مساحات العمل",
  },

  // Operations
  {
    id: "orders_stage_change",
    category: "operations",
    slug: "orders.stage.change",
    titleKey: "admin.rbac.special.ordersStageChange",
    descKey: "admin.rbac.special.ordersStageChangeDesc",
    defaultTitle: "تغيير وتحديث مراحل خط الإنتاج",
    defaultDesc: "تقديم أو إرجاع مراحل أوامر الإنتاج ومراقبة الجودة",
  },
  {
    id: "deliveries_signoff",
    category: "operations",
    slug: "deliveries.status.update",
    titleKey: "admin.rbac.special.deliveriesSignoff",
    descKey: "admin.rbac.special.deliveriesSignoffDesc",
    defaultTitle: "اعتماد وتوقيع محاضر التسليم",
    defaultDesc: "تأكيد اكتمال التسليم والتركيب الميداني بنجاح لدى العميل",
  },
  {
    id: "tasks_assign",
    category: "operations",
    slug: "tasks.assign",
    titleKey: "admin.rbac.special.tasksAssign",
    descKey: "admin.rbac.special.tasksAssignDesc",
    defaultTitle: "إسناد وتعيين المهام للموظفين",
    defaultDesc: "توزيع المهام التشغيلية على الفنيين وإعادة تعيينها",
  },
  {
    id: "tasks_acknowledge",
    category: "operations",
    slug: "tasks.acknowledge",
    titleKey: "admin.rbac.special.tasksAcknowledge",
    descKey: "admin.rbac.special.tasksAcknowledgeDesc",
    defaultTitle: "اعتماد إغلاق المهام المنجزة",
    defaultDesc: "مراجعة تقرير الفني الميداني واعتماد إنهاء المهمة رسمياً",
  },

  // System
  {
    id: "team_manage",
    category: "system",
    slug: "team.manage",
    titleKey: "admin.rbac.special.teamManage",
    descKey: "admin.rbac.special.teamManageDesc",
    defaultTitle: "إدارة حسابات الموظفين والصلاحيات",
    defaultDesc: "إنشاء وتعطيل الحسابات، تخصيص الأدوار، وتعديل صلاحيات الوصول",
  },
  {
    id: "settings_manage",
    category: "system",
    slug: "settings.manage",
    titleKey: "admin.rbac.special.settingsManage",
    descKey: "admin.rbac.special.settingsManageDesc",
    defaultTitle: "تعديل إعدادات وهوية النظام",
    defaultDesc: "تعديل نسب ضريبة القيمة المضافة، العملة، وشروط العقود الافتراضية",
  },
  {
    id: "customers_delete",
    category: "commercial",
    slug: "customers.delete",
    titleKey: "admin.rbac.special.customersDelete",
    descKey: "admin.rbac.special.customersDeleteDesc",
    defaultTitle: "حذف ملفات العملاء نهائياً",
    defaultDesc: "حذف العميل وحساباته نهائياً من قاعدة بيانات الشركة",
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   Effective Permissions Resolution Engine & Invalidation Cache
   ────────────────────────────────────────────────────────────────────────── */

interface CachedPerms {
  perms: Set<string>;
  timestamp: number;
}

// 60-second TTL in-memory cache per (tenantId:role)
const permissionsCache = new Map<string, CachedPerms>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Invalidate the in-memory cache for a tenant or specific role.
 * Call this immediately upon saving role permissions, user role update, or role deletion.
 */
export function invalidateRolePermissionsCache(tenantId?: string, role?: string): void {
  if (!tenantId) {
    permissionsCache.clear();
    return;
  }
  if (!role) {
    for (const key of permissionsCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        permissionsCache.delete(key);
      }
    }
    return;
  }
  permissionsCache.delete(`${tenantId}:${role}`);
}

/**
 * Resolves the authoritative effective permissions for a role in a tenant.
 *
 * Rules:
 * 1. Owner always gets unconditional full access across everything.
 * 2. Checks in-memory cache first (invalidated on any update).
 * 3. Queries saved rows from `role_permissions` table in DB.
 * 4. If saved rows exist in DB, they are the SOLE SOURCE OF TRUTH (customizable profiles).
 * 5. If NO rows exist in DB yet, safely falls back to DEFAULT_ROLE_PERMISSIONS.
 */
export async function resolveEffectivePermissions(
  tenantId: string,
  role: string,
  options?: { skipCache?: boolean },
): Promise<Set<string>> {
  if (role === "owner") {
    return new Set(ALL_PERMISSION_SLUGS);
  }

  const cacheKey = `${tenantId}:${role}`;
  if (!options?.skipCache) {
    const cached = permissionsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.perms;
    }
  }

  try {
    const { db } = await import("@/db/client.server");
    const { rolePermissions, tenantRoles } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

    // 1. Verify if the role is registered in tenant_roles for this tenant
    const [roleRow] = await db
      .select({ slug: tenantRoles.slug })
      .from(tenantRoles)
      .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.slug, role)))
      .limit(1);

    let effectiveSet: Set<string>;

    if (!roleRow) {
      // UNINITIALIZED ROLE: The role is not yet registered or seeded in tenant_roles.
      // Auto-seed default permissions if this is a known profile.
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role];
      if (defaultPerms && defaultPerms.length > 0) {
        try {
          const roleLabels: Record<string, string> = {
            admin: "مدير النظام (Administrator)",
            sales: "مشرف عمليات (Manager)",
            worker: "فني مهام (Task Worker)",
            viewer: "مشاهد (Viewer)",
          };
          await db.transaction(async (tx) => {
            await tx
              .insert(tenantRoles)
              .values({
                tenantId,
                slug: role,
                label: roleLabels[role] || role,
                description: "تمت التهيئة التلقائية للأدوار الافتراضية",
              })
              .onConflictDoNothing();

            const rowsToInsert = defaultPerms.map((slug) => ({
              tenantId,
              role,
              permissionSlug: slug,
            }));
            await tx.insert(rolePermissions).values(rowsToInsert).onConflictDoNothing();
          });
        } catch (seedErr) {
          console.warn("[resolveEffectivePermissions] Auto-seed failed:", seedErr);
        }
        effectiveSet = new Set(defaultPerms);
      } else {
        effectiveSet = new Set<string>();
      }
    } else {
      // INITIALIZED ROLE: Persisted permissions in role_permissions are STRICTLY AUTHORITATIVE.
      const rows = await db
        .select({ permissionSlug: rolePermissions.permissionSlug })
        .from(rolePermissions)
        .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role)));

      // If rows exist, use them.
      // If 0 rows exist, this role was INTENTIONALLY CONFIGURED WITH ZERO PERMISSIONS (or created with zero).
      // Under NO circumstances should this fall back to DEFAULT_ROLE_PERMISSIONS.
      effectiveSet = new Set(rows.map((r) => r.permissionSlug));
    }

    permissionsCache.set(cacheKey, {
      perms: effectiveSet,
      timestamp: Date.now(),
    });

    return effectiveSet;
  } catch (err: unknown) {
    console.error("[resolveEffectivePermissions] DB lookup failed, failing closed:", err);
    // Security fail-closed: do NOT grant default elevated permissions on unexpected database failure
    return new Set<string>();
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Universal Authorization Guards
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Check whether a TenantContext or UserPermissions has the required permission slug.
 * Owner role always returns true unconditionally.
 */
export function hasEffectivePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slug: PermissionSlug | string,
): boolean {
  if (ctxOrPerms.role === "owner") return true;

  if ("permissions" in ctxOrPerms && ctxOrPerms.permissions instanceof Set) {
    return ctxOrPerms.permissions.has(slug);
  }

  // Fallback for mock contexts without loaded Set
  const defaults = DEFAULT_ROLE_PERMISSIONS[ctxOrPerms.role] || [];
  return defaults.includes(slug);
}

/** Legacy alias for backward compatibility with existing tests. */
export const hasPermission = hasEffectivePermission;

/**
 * Check whether the context holds AT LEAST ONE of the specified permission slugs.
 */
export function hasAnyEffectivePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slugs: (PermissionSlug | string)[],
): boolean {
  if (ctxOrPerms.role === "owner") return true;
  return slugs.some((s) => hasEffectivePermission(ctxOrPerms, s));
}

/**
 * Guard that throws a 403 Forbidden error if the user lacks the required permission.
 */
export function requirePermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slug: PermissionSlug | string,
  moduleName?: string,
): void {
  if (!hasEffectivePermission(ctxOrPerms, slug)) {
    throw new Error(
      `Forbidden: missing required permission '${slug}'${moduleName ? ` to access ${moduleName}` : ""}`,
    );
  }
}

/**
 * Guard that throws if the user lacks ALL of the specified permissions.
 */
export function requireAnyPermission(
  ctxOrPerms: TenantContext | UserPermissions,
  slugs: (PermissionSlug | string)[],
  moduleName?: string,
): void {
  if (!hasAnyEffectivePermission(ctxOrPerms, slugs)) {
    throw new Error(
      `Forbidden: insufficient permissions${moduleName ? ` to access ${moduleName}` : ""}`,
    );
  }
}

/**
 * A guard for places where we expect exactly one canonical role-check.
 */
export function requireRole(ctx: TenantContext, allowed: string[]): void {
  if (ctx.role === "owner") return;
  if (!allowed.includes(ctx.role)) {
    throw new Error(`Forbidden: role '${ctx.role}' not in [${allowed.join(", ")}]`);
  }
}

/**
 * Guard that strictly forbids Task Workers from accessing non-task ERP modules.
 * Verifies both role string and absence of managerial privileges.
 */
export function forbidWorker(ctx: TenantContext, moduleName?: string): void {
  if (ctx.role === "owner" || ctx.role === "admin") return;
  if (ctx.role === "worker") {
    throw new Error(
      `Forbidden: Task Workers do not have access to ${moduleName || "this module"}`,
    );
  }
}

/**
 * Decide whether `roleOrCtx` is allowed to perform a write on a tenant table/resource.
 * Supports both legacy string checks and modern permission-aware contexts.
 */
export function canWrite(roleOrCtx: TenantRole | TenantContext, resource?: string): boolean {
  if (typeof roleOrCtx === "string") {
    return roleOrCtx === "owner" || roleOrCtx === "admin" || roleOrCtx === "sales";
  }
  const ctx = roleOrCtx;
  if (ctx.role === "owner") return true;

  if (resource && ctx.permissions) {
    return (
      ctx.permissions.has(`${resource}.create`) ||
      ctx.permissions.has(`${resource}.edit`) ||
      ctx.permissions.has(`${resource}.manage`)
    );
  }
  if (ctx.permissions) {
    for (const p of ctx.permissions) {
      if (p.endsWith(".create") || p.endsWith(".edit") || p.endsWith(".manage")) return true;
    }
    return false;
  }
  return ctx.role === "admin" || ctx.role === "sales";
}

/**
 * Decide whether `roleOrCtx` is allowed to delete on a tenant table/resource.
 */
export function canDelete(roleOrCtx: TenantRole | TenantContext, resource?: string): boolean {
  if (typeof roleOrCtx === "string") {
    return roleOrCtx === "owner" || roleOrCtx === "admin";
  }
  const ctx = roleOrCtx;
  if (ctx.role === "owner") return true;

  if (resource && ctx.permissions) {
    return ctx.permissions.has(`${resource}.delete`);
  }
  if (ctx.permissions) {
    for (const p of ctx.permissions) {
      if (p.endsWith(".delete")) return true;
    }
    return false;
  }
  return ctx.role === "admin";
}
