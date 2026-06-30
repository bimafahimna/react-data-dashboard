import { z } from "zod";
import type { Range } from "../analytics/types";

const RANGE_VALUES = ["daily", "weekly", "monthly"] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const schema = z.object({
  range: z
    .preprocess(first, z.enum(RANGE_VALUES))
    .catch("daily"),
  storeId: z
    .preprocess(first, z.coerce.number().int().positive())
    .optional()
    .catch(undefined),
  currency: z
    .preprocess((v: string | string[] | undefined) => {
      const s = first(v);
      return typeof s === "string" ? s.toUpperCase() : s;
    }, z.string().regex(/^[A-Z]{3}$/))
    .optional()
    .catch(undefined),
  from: z.preprocess(first, z.string()).optional().catch(undefined),
  to: z.preprocess(first, z.string()).optional().catch(undefined),
});

export interface DashboardSearchParams {
  range: Range;
  storeId?: number;
  currency?: string;
  from?: string;
  to?: string;
}

export function parseDashboardSearchParams(
  input: Record<string, string | string[] | undefined>,
): DashboardSearchParams {
  return schema.parse(input) as DashboardSearchParams;
}
