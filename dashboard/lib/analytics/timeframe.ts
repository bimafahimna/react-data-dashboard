import { Bucket, Delta, Range, RANGE_TO_BUCKET, Direction } from "./types";

export function shiftYearsUtc(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // Clamp day so e.g. Feb 29 -> Feb 28 in non-leap targets.
  const lastDayOfTargetMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      y,
      m,
      clampedDay,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
}

export interface ResolvedWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: Bucket;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcWeekMonday(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay();
  const deltaDays = dow === 0 ? 6 : dow - 1;
  return new Date(day.getTime() - deltaDays * DAY_MS);
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function parseIso(input: string | undefined): Date | null {
  if (!input) return null;
  const t = Date.parse(input);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function resolveWindow(
  range: Range,
  fromParam: string | undefined,
  toParam: string | undefined,
  now: Date = new Date(),
): ResolvedWindow {
  const bucket = RANGE_TO_BUCKET[range];

  const explicitFrom = parseIso(fromParam);
  const explicitTo = parseIso(toParam);
  if (explicitFrom && explicitTo && explicitTo > explicitFrom) {
    const span = explicitTo.getTime() - explicitFrom.getTime();
    return {
      bucket,
      from: explicitFrom,
      to: explicitTo,
      previousFrom: new Date(explicitFrom.getTime() - span),
      previousTo: explicitFrom,
    };
  }

  let to: Date;
  let from: Date;
  if (range === "daily") {
    to = new Date(startOfUtcDay(now).getTime() + DAY_MS);
    from = new Date(to.getTime() - 7 * DAY_MS);
  } else if (range === "weekly") {
    to = new Date(startOfUtcWeekMonday(now).getTime() + 7 * DAY_MS);
    from = new Date(to.getTime() - 8 * 7 * DAY_MS);
  } else {
    const m = startOfUtcMonth(now);
    to = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    from = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 5, 1));
  }
  const span = to.getTime() - from.getTime();
  return {
    bucket,
    from,
    to,
    previousFrom: new Date(from.getTime() - span),
    previousTo: from,
  };
}

export function buildDelta(current: number, previous: number): Delta {
  const changeNominal = current - previous;
  let direction: Direction;
  if (changeNominal > 0) direction = "up";
  else if (changeNominal < 0) direction = "down";
  else direction = "flat";
  // When previous is 0 the percent is undefined; report 0 and rely on
  // `previous === 0` at the call-site (or the omitted chip) to signal it.
  const changePct = previous === 0 ? 0 : (changeNominal / previous) * 100;
  return { current, previous, changeNominal, changePct, direction };
}
