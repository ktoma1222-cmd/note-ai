export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatSignedPoint(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}pt`;
}

export function formatSignedCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 4) return "*".repeat(digits.length);
  const last4 = digits.slice(-4);
  const leadCount = Math.min(3, digits.length - 4);
  const lead = digits.slice(0, leadCount);
  return `${lead}-****-${last4}`;
}

export type Tone = "positive" | "negative" | "neutral";

export function toneForChange(
  diff: number | null | undefined,
  higherIsBetter: boolean
): Tone {
  if (diff === null || diff === undefined || diff === 0 || Number.isNaN(diff)) {
    return "neutral";
  }
  const isUp = diff > 0;
  if (higherIsBetter) return isUp ? "positive" : "negative";
  return isUp ? "negative" : "positive";
}
