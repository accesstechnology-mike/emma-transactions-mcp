import { z } from 'zod';

export const TransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  category: z.string().optional(),
  account: z.string().optional(),
  merchant: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['Income', 'Expense']).optional(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export interface SpendingSummary {
  total_expenses: number;
  total_income: number;
  net: number;
  by_category: Record<string, number>;
  by_account: Record<string, number>;
  by_month: Record<string, number>;
  count: number;
}

export interface ValidationResult {
  ok: boolean;
  count: number;
  fields: string[];
  categories: string[];
  accounts: string[];
  currencies: string[];
  date_range?: {
    first: string;
    last: string;
  };
}
