export interface PricingConfig {
  base_fee: number;
  base_hours: number;
  overdue_fee: number;
  overdue_hours: number;
}

export const PICKUP_RETRY_GRACE_HOURS = 2;
export const PICKUP_RETRY_HOURLY_FEE = 3000;

export function calculateFee(startTime: string | Date, cfg: PricingConfig, now: Date = new Date()): number {
  const start = new Date(startTime).getTime();
  const elapsedMs = Math.max(0, now.getTime() - start);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours <= cfg.base_hours) return cfg.base_fee;

  const overdueHours = elapsedHours - cfg.base_hours;
  const overdueBlocks = Math.ceil(overdueHours / cfg.overdue_hours);
  return cfg.base_fee + overdueBlocks * cfg.overdue_fee;
}

export function calculatePickupRetryFee(startTime: string | Date, now: Date = new Date()): number {
  const start = new Date(startTime).getTime();
  const elapsedMs = Math.max(0, now.getTime() - start);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours <= PICKUP_RETRY_GRACE_HOURS) return 0;

  return Math.ceil(elapsedHours - PICKUP_RETRY_GRACE_HOURS) * PICKUP_RETRY_HOURLY_FEE;
}

export function isPickupRetryOrder(order: { failure_reason?: string | null }): boolean {
  return order.failure_reason === "pickup_returned_with_item";
}

export function calculateOrderFee(
  order: {
    failure_reason?: string | null;
    is_paid: boolean;
    start_time: string;
    status: string;
    total_amount: number;
  },
  cfg: PricingConfig,
  now: Date = new Date(),
): number {
  if (order.is_paid) return order.total_amount;
  if (isPickupRetryOrder(order)) return calculatePickupRetryFee(order.start_time, now);
  return calculateFee(order.start_time, cfg, now);
}

export function isOverdue(startTime: string | Date, cfg: PricingConfig, now: Date = new Date()): boolean {
  const elapsedHours = (now.getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60);
  return elapsedHours > cfg.base_hours;
}

export function formatVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

export function buildVietQR(bankCode: string, account: string, amount: number, content: string): string {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
    accountName: "SMART LOCKER",
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(account)}-compact2.png?${params.toString()}`;
}
