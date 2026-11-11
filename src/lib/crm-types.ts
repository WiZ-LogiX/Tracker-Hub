// src/lib/crm-types.ts
// PeleCanon CRM Foundation Types & Constants

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "unqualified"
  | "converted"
  | "lost";

export type LeadSource =
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "website"
  | "referral"
  | "walk_in"
  | "exhibition"
  | "existing_customer"
  | "other";

export type ProjectType =
  | "residential"
  | "commercial"
  | "hospitality"
  | "renovation"
  | "other";

export type PipelineStage =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "site_visit"
  | "design_measurement"
  | "quotation"
  | "negotiation"
  | "won"
  | "lost";

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

export interface LeadItem {
  id: string;
  tenantId: string;
  leadNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  source: LeadSource;
  interestedProduct: string | null;
  estimatedBudget: number | null;
  notes: string | null;
  assignedSalesperson: string | null;
  assignedSalespersonName?: string | null;
  status: LeadStatus;
  nextAction: string | null;
  nextActionDate: string | null;
  convertedCustomerId: string | null;
  convertedCustomerName?: string | null;
  convertedOpportunityId: string | null;
  convertedOpportunityNumber?: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityItem {
  id: string;
  tenantId: string;
  opportunityNumber: string;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  leadId: string | null;
  leadNumber?: string | null;
  title: string;
  projectType: ProjectType;
  value: number;
  salesOwner: string | null;
  salesOwnerName?: string | null;
  stage: PipelineStage;
  source: string | null;
  expectedCloseDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  siteAddress: string | null;
  notes: string | null;
  status: OpportunityStatus;
  lostReason: string | null;
  quotesCount?: number;
  totalQuotesValue?: number;
  tasksCount?: number;
  openTasksCount?: number;
  ordersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityTimelineEvent {
  id: string;
  timestamp: string;
  type:
    | "lead_created"
    | "lead_converted"
    | "stage_changed"
    | "quote_created"
    | "quote_status_changed"
    | "task_created"
    | "task_completed"
    | "order_created"
    | "note_added"
    | "system";
  title: string;
  description?: string;
  actorName?: string;
  metadata?: Record<string, any>;
}

export interface OpportunityDetail extends OpportunityItem {
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    companyName?: string | null;
  } | null;
  quotes?: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
  tasks?: Array<{
    id: string;
    taskCode: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assigneeName?: string | null;
  }>;
  orders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
  timeline?: OpportunityTimelineEvent[];
}

export interface CRMStats {
  totalPipelineValue: number;
  openDealsCount: number;
  wonDealsCount: number;
  wonDealsValue: number;
  leadsCount: number;
  newLeadsCount: number;
  attentionRequiredCount: number;
  stageBreakdown: Record<PipelineStage, { count: number; value: number }>;
}

export interface CreateLeadInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  source?: LeadSource;
  interestedProduct?: string | null;
  estimatedBudget?: number | null;
  notes?: string | null;
  assignedSalesperson?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
}

export interface UpdateLeadInput {
  id: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  source?: LeadSource;
  interestedProduct?: string | null;
  estimatedBudget?: number | null;
  notes?: string | null;
  assignedSalesperson?: string | null;
  status?: LeadStatus;
  nextAction?: string | null;
  nextActionDate?: string | null;
}

export interface ConvertLeadInput {
  leadId: string;
  // If customerId is provided, reuse existing customer. Otherwise create a new customer.
  customerId?: string | null;
  newCustomer?: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    companyName?: string | null;
  };
  // Opportunity details to create
  opportunityTitle: string;
  projectType?: ProjectType;
  value?: number;
  salesOwner?: string | null;
  expectedCloseDate?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  siteAddress?: string | null;
  notes?: string | null;
}

export interface CreateOpportunityInput {
  customerId: string;
  leadId?: string | null;
  title: string;
  projectType?: ProjectType;
  value?: number;
  salesOwner?: string | null;
  stage?: PipelineStage;
  source?: string | null;
  expectedCloseDate?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  siteAddress?: string | null;
  notes?: string | null;
}

export interface UpdateOpportunityInput {
  id: string;
  title?: string;
  projectType?: ProjectType;
  value?: number;
  salesOwner?: string | null;
  stage?: PipelineStage;
  source?: string | null;
  expectedCloseDate?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  siteAddress?: string | null;
  notes?: string | null;
  status?: OpportunityStatus;
  lostReason?: string | null;
}

export const LEAD_SOURCES: { value: LeadSource; label: string; icon?: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "walk_in", label: "Walk-in" },
  { value: "exhibition", label: "Exhibition" },
  { value: "existing_customer", label: "Existing Customer" },
  { value: "other", label: "Other" },
];

export const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "blue" },
  { value: "contacted", label: "Contacted", color: "indigo" },
  { value: "qualified", label: "Qualified", color: "purple" },
  { value: "unqualified", label: "Unqualified", color: "gray" },
  { value: "converted", label: "Converted", color: "emerald" },
  { value: "lost", label: "Lost", color: "rose" },
];

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "hospitality", label: "Hospitality" },
  { value: "renovation", label: "Renovation" },
  { value: "other", label: "Other" },
];

export const PIPELINE_STAGES: {
  id: PipelineStage;
  name: string;
  nameAr?: string;
  color: string;
  isWon?: boolean;
  isLost?: boolean;
}[] = [
  { id: "new_lead", name: "New Lead", nameAr: "عميل محتمل جديد", color: "sky" },
  { id: "contacted", name: "Contacted", nameAr: "تم التواصل والمتابعة", color: "blue" },
  { id: "qualified", name: "Qualified", nameAr: "تحديد المتطلبات والتأهيل", color: "indigo" },
  { id: "site_visit", name: "Site Visit / Inspection", nameAr: "معاينة ورفع مقاسات", color: "violet" },
  { id: "design_measurement", name: "Design / Measurement", nameAr: "تسعير وتكلفة هندسية", color: "purple" },
  { id: "quotation", name: "Quotation / Proposal", nameAr: "تم إرسال عرض السعر", color: "amber" },
  { id: "negotiation", name: "Negotiation / Revision", nameAr: "تفاوض تجاري ومراجعة", color: "orange" },
  { id: "won", name: "Won / Deal Closed", nameAr: "تم الفوز بالصفقة", color: "emerald", isWon: true },
  { id: "lost", name: "Lost", nameAr: "صفقة خاسرة", color: "rose", isLost: true },
];

export type LostReasonKey =
  | "price"
  | "timing"
  | "competitor"
  | "customer_cancelled"
  | "no_response"
  | "other";

export interface LostReasonOption {
  value: LostReasonKey;
  label: string;
  labelAr: string;
}

export const LOST_REASONS: LostReasonOption[] = [
  { value: "price", label: "Price / High Budget", labelAr: "السعر / الميزانية مرتفعة" },
  { value: "timing", label: "Timing / Project Postponed", labelAr: "التوقيت / تم تأجيل المشروع" },
  { value: "competitor", label: "Lost to Competitor", labelAr: "اختيار منافس آخر" },
  { value: "customer_cancelled", label: "Customer Cancelled", labelAr: "العميل صرف النظر عن المشروع" },
  { value: "no_response", label: "No Response / Unreachable", labelAr: "عدم الرد أو انقطاع التواصل" },
  { value: "other", label: "Other", labelAr: "سبب آخر" },
];

// ── TASK 25: Sales Team & Follow-Up Operations Types ─────────────────────────

export type ActivityType =
  | "call"
  | "whatsapp"
  | "email"
  | "site_visit"
  | "meeting"
  | "quote_follow_up"
  | "other";

export interface ActivityTypeOption {
  value: ActivityType;
  label: string;
  labelAr: string;
  icon: string;
}

export const ACTIVITY_TYPES: ActivityTypeOption[] = [
  { value: "call", label: "Phone Call", labelAr: "مكالمة هاتفية", icon: "Phone" },
  { value: "whatsapp", label: "WhatsApp Message", labelAr: "رسالة واتساب", icon: "MessageSquare" },
  { value: "email", label: "Email", labelAr: "بريد إلكتروني", icon: "Mail" },
  { value: "site_visit", label: "Site Visit / Inspection", labelAr: "زيارة موقع / معاينة", icon: "MapPin" },
  { value: "meeting", label: "In-Person Meeting", labelAr: "اجتماع مباشر", icon: "Users" },
  { value: "quote_follow_up", label: "Quotation Follow-Up", labelAr: "متابعة عرض سعر", icon: "FileText" },
  { value: "other", label: "Other Activity", labelAr: "إجراء تجاري آخر", icon: "Clock" },
];

export type AttentionReason =
  | "overdue"
  | "due_today"
  | "no_next_action"
  | "quote_without_followup"
  | "negotiation_without_next_action";

export interface AttentionItem {
  id: string; // opportunityId or leadId
  entityType: "opportunity" | "lead";
  code: string; // OPP-xxxx or LED-xxxx
  title: string;
  customerId?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  salesOwnerId?: string | null;
  salesOwnerName?: string | null;
  stage?: PipelineStage | null;
  value?: number;
  nextAction?: string | null;
  nextActionDate?: string | null;
  reason: AttentionReason;
  reasonLabel: string;
  reasonLabelAr: string;
  urgency: "critical" | "warning" | "info";
}

export interface SalespersonWorkload {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  activeLeadsCount: number;
  openOpportunitiesCount: number;
  pipelineValue: number;
  quotesCount: number;
  quotesValue: number;
  overdueFollowUpsCount: number;
  dueTodayCount: number;
  noNextActionCount: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  workloadLevel: "low" | "balanced" | "heavy" | "overloaded";
}

export interface SalesWorkspaceKPIs {
  newLeadsCount: number;
  openOpportunitiesCount: number;
  pipelineValue: number;
  dueTodayCount: number;
  overdueCount: number;
  quotesAwaitingResponseCount: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
}

export interface LogActivityInput {
  entityType: "opportunity" | "lead";
  entityId: string;
  activityType: ActivityType;
  notes: string;
  nextAction?: string | null;
  nextActionDate?: string | null;
  markFollowUpCompleted?: boolean;
  relatedTaskId?: string | null;
}

export interface BulkAssignInput {
  entityType: "opportunity" | "lead";
  entityIds: string[];
  salesOwnerId: string | null; // null to unassign
}

