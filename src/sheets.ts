import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { Transaction, TransactionSchema, ValidationResult } from './types.js';

const COLUMN_ALIASES = {
  date: ['date', 'transaction date', 'timestamp', 'time'],
  description: ['description', 'name', 'transaction', 'transaction name', 'title', 'custom name', 'counterparty', 'merchant', 'additional details'],
  amount: ['amount', 'value', 'transaction amount', 'money out', 'money in'],
  currency: ['currency', 'currency code'],
  category: ['category', 'emma category'],
  account: ['account', 'account name', 'bank account', 'wallet'],
  merchant: ['merchant', 'vendor', 'payee'],
  notes: ['notes', 'note', 'comment', 'memo'],
  type: ['type', 'transaction type'],
} as const;

type CanonicalColumn = keyof typeof COLUMN_ALIASES;
type CsvRow = Record<string, unknown>;

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function valueFor(row: CsvRow, column: CanonicalColumn): string | undefined {
  const aliases = new Set<string>(COLUMN_ALIASES[column]);
  for (const [key, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(key)) && value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return undefined;
}

export function getCsvUrl(input: string, gid: string = '0'): string {
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed) && (/\/pub\?/i.test(trimmed) || /\/export\?/i.test(trimmed))) {
    return trimmed;
  }

  if (/^[a-zA-Z0-9-_]{30,}$/.test(trimmed)) {
    return `https://docs.google.com/spreadsheets/d/${trimmed}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }

  return trimmed;
}

export function parseAmount(raw: string): number {
  const value = raw.trim();
  const isParenthesizedNegative = /^\(.*\)$/.test(value);
  const isExplicitNegative = /-/.test(value);
  const numeric = value.replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(numeric);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${raw}`);
  }

  return isParenthesizedNegative || isExplicitNegative ? -Math.abs(parsed) : parsed;
}

export function normalizeDate(raw: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const month = Number.parseInt(slashDate[1], 10);
    const day = Number.parseInt(slashDate[2], 10);
    const year = Number.parseInt(slashDate[3], 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);

  throw new Error(`Invalid date: ${raw}`);
}

export function parseTransactionsFromCsv(csv: string): Transaction[] {
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[];

  return records.map((row, index) => {
    const date = valueFor(row, 'date');
    const amountRaw = valueFor(row, 'amount');

    if (!date || amountRaw === undefined) {
      throw new Error(`Row ${index + 2} is missing required columns: date or amount/value`);
    }

    const description = valueFor(row, 'description') ?? '[Unlabelled transaction]';
    const amount = parseAmount(amountRaw);
    const currency = valueFor(row, 'currency') ?? 'GBP';
    const typeRaw = valueFor(row, 'type')?.toLowerCase();

    return TransactionSchema.parse({
      date: normalizeDate(date),
      description,
      amount,
      currency,
      category: valueFor(row, 'category'),
      account: valueFor(row, 'account'),
      merchant: valueFor(row, 'merchant'),
      notes: valueFor(row, 'notes'),
      type: typeRaw === 'income' || amount > 0 ? 'Income' : 'Expense',
    });
  });
}

export async function fetchTransactions(url: string): Promise<Transaction[]> {
  try {
    const response = await axios.get(url, { responseType: 'text' });
    return parseTransactionsFromCsv(String(response.data));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch or parse sheet: ${message}`);
  }
}

export function validateTransactions(transactions: Transaction[]): ValidationResult {
  const fields = Object.keys(TransactionSchema.shape);
  const categories = [...new Set(transactions.map((t) => t.category).filter(Boolean) as string[])].sort();
  const accounts = [...new Set(transactions.map((t) => t.account).filter(Boolean) as string[])].sort();
  const currencies = [...new Set(transactions.map((t) => t.currency).filter(Boolean))].sort();
  const sortedDates = transactions.map((t) => t.date).sort();

  return {
    ok: true,
    count: transactions.length,
    fields,
    categories,
    accounts,
    currencies,
    date_range: sortedDates.length
      ? { first: sortedDates[0], last: sortedDates[sortedDates.length - 1] }
      : undefined,
  };
}
