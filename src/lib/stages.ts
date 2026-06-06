export const ORDER_STAGES = [
  'deposit_received',
  'design_approved',
  'cutting',
  'assembly',
  'finishing',
  'quality_check',
  'ready_for_pickup',
  'delivered',
  'completed',
] as const;

export type OrderStage = typeof ORDER_STAGES[number];

export const STAGE_LABEL_AR: Record<OrderStage, string> = {
  deposit_received: 'استلام العربون',
  design_approved: 'اعتماد التصميم',
  cutting: 'قص الخامات',
  assembly: 'التجميع',
  finishing: 'التشطيب والدهان',
  quality_check: 'فحص الجودة',
  ready_for_pickup: 'جاهز للاستلام',
  delivered: 'تم التسليم',
  completed: 'مكتمل',
};

export function stageIndex(s: OrderStage): number {
  return ORDER_STAGES.indexOf(s);
}

export function nextStage(s: OrderStage): OrderStage | null {
  const i = stageIndex(s);
  return i < ORDER_STAGES.length - 1 ? ORDER_STAGES[i + 1] : null;
}
