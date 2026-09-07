import { z } from 'zod';

/**
 * Evidence files are named `YYYY-MM-DD.json` and follow schema version 2.
 * The server is strictly read-only: it never writes evidence and never
 * fetches remote data (no Google Sheets, no scraping).
 */
export const SCHEMA_VERSION = 2 as const;

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  institution: z.string().optional(),
  type: z.string().optional(),
  currency: z.string().default('GBP'),
  balance: z.number(),
  available: z.number().optional(),
  last_updated: z.string().optional(),
});

export type Account = z.infer<typeof AccountSchema>;

export const SnapshotSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  captured_at: z.string().optional(),
  source: z.string().optional(),
  base_currency: z.string().default('GBP'),
  accounts: z.array(AccountSchema),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

export interface SnapshotSummary {
  date: string;
  file: string;
  schema_version: number;
  captured_at?: string;
  source?: string;
  base_currency: string;
  account_count: number;
}

export interface BalancesResult {
  date: string;
  captured_at?: string;
  source?: string;
  base_currency: string;
  account_count: number;
  totals_by_currency: Record<string, number>;
  accounts?: Account[];
}

export interface AccountHistoryPoint {
  date: string;
  balance: number;
  available?: number;
  currency: string;
}

export interface AccountResult {
  account: Account;
  date: string;
  captured_at?: string;
  history?: AccountHistoryPoint[];
}
