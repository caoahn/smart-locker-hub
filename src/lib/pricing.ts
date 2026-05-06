export interface PricingConfig {
  base_fee: number;
  base_hours: number;
  overdue_fee: number;
  overdue_hours: number;
}

export function calculateFee(startTime: string | Date, cfg: PricingConfig, now: Date = new Date()): number {
  const start = new Date(startTime).getTime();
  const elapsedMs = Math.max(0, now.getTime() - start);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours <= cfg.base_hours) return cfg.base_fee;
  const overdueHours = elapsedHours - cfg.base_hours;
  const overdueBlocks = Math.ceil(overdueHours / cfg.overdue_hours);
  return cfg.base_fee + overdueBlocks * cfg.overdue_fee;
}

export function isOverdue(startTime: string | Date, cfg: PricingConfig, now: Date = new Date()): boolean {
  const elapsedHours = (now.getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60);
  return elapsedHours > cfg.base_hours;
}

export function formatVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function buildVietQR(bankCode: string, account: string, amount: number, content: string): string {
  // Uses VietQR.io static image API — no key required
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
    accountName: "SMART LOCKER",
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(account)}-compact2.png?${params.toString()}`;
}