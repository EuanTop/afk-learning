import type { StoryDeliveryRecord, StoryRuntimeConfig } from "@capybara-letter/shared";

function coerceDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function resolveSessionNow(runtime?: StoryRuntimeConfig | null): Date {
  if (runtime?.mode === "test" && runtime.simulatedNow) {
    const simulated = new Date(runtime.simulatedNow);
    if (isValidDate(simulated)) {
      return simulated;
    }
  }
  return new Date();
}

export function toLocalDateKey(value: string | Date): string {
  const date = coerceDate(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSameLocalDay(left: string | Date, right: string | Date): boolean {
  return toLocalDateKey(left) === toLocalDateKey(right);
}

export function getScheduledMoment(reference: Date, deliveryTime: string): Date {
  const [hours, minutes] = deliveryTime.split(":").map((part) => Number.parseInt(part, 10));
  const scheduled = new Date(reference);
  scheduled.setHours(Number.isFinite(hours) ? hours : 20, Number.isFinite(minutes) ? minutes : 30, 0, 0);
  return scheduled;
}

export function findLatestAvailableDelivery(
  deliveryLog: StoryDeliveryRecord[],
  now: Date,
): StoryDeliveryRecord | null {
  const nowTime = now.getTime();
  return (
    [...deliveryLog]
      .filter((entry) => new Date(entry.deliveredAt).getTime() <= nowTime)
      .sort(
        (left, right) =>
          new Date(right.deliveredAt).getTime() - new Date(left.deliveredAt).getTime(),
      )[0] ?? null
  );
}

export function formatRelativeMomentLabel(iso: string, reference: Date): string {
  const target = new Date(iso);
  if (!isValidDate(target)) {
    return iso;
  }

  const diffMs = target.getTime() - reference.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const absMinutes = Math.abs(diffMinutes);
  const absoluteLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(target);

  if (absMinutes < 1) {
    return `刚刚 · ${absoluteLabel}`;
  }

  if (absMinutes < 60) {
    return diffMinutes < 0
      ? `${absMinutes} 分钟前 · ${absoluteLabel}`
      : `${absMinutes} 分钟后 · ${absoluteLabel}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return diffHours < 0
      ? `${absHours} 小时前 · ${absoluteLabel}`
      : `${absHours} 小时后 · ${absoluteLabel}`;
  }

  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);
  return diffDays < 0
    ? `${absDays} 天前 · ${absoluteLabel}`
    : `${absDays} 天后 · ${absoluteLabel}`;
}

export function toDateTimeLocalInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!isValidDate(date)) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDateTimeLocalInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return isValidDate(date) ? date.toISOString() : null;
}
