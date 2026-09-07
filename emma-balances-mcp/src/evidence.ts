import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Account,
  AccountHistoryPoint,
  AccountResult,
  BalancesResult,
  SCHEMA_VERSION,
  Snapshot,
  SnapshotSchema,
  SnapshotSummary,
} from './types.js';

const SNAPSHOT_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export function resolveEvidenceDir(input?: string): string {
  const dir = (input && input.trim()) || process.env.EMMA_EVIDENCE_DIR || '';
  if (!dir) {
    throw new Error(
      'No evidence_dir provided and EMMA_EVIDENCE_DIR environment variable is not set.',
    );
  }
  return dir;
}

/** Return the snapshot dates present in the evidence directory, sorted ascending. */
export function listSnapshotDates(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read evidence directory "${dir}": ${message}`);
  }

  return entries
    .map((name) => name.match(SNAPSHOT_FILE))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1])
    .sort();
}

function readSnapshotFile(dir: string, date: string): Snapshot {
  const file = join(dir, `${date}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read snapshot "${date}": ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Snapshot "${date}" is not valid JSON: ${message}`);
  }

  const version = (parsed as { schema_version?: unknown })?.schema_version;
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `Snapshot "${date}" has unsupported schema_version ${JSON.stringify(version)}; expected ${SCHEMA_VERSION}.`,
    );
  }

  const result = SnapshotSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Snapshot "${date}" failed validation: ${result.error.message}`);
  }

  // The filename is the authoritative date; fall back to it when absent.
  return { ...result.data, date: result.data.date ?? date };
}

export function getLatestDate(dir: string): string {
  const dates = listSnapshotDates(dir);
  if (dates.length === 0) {
    throw new Error(`No snapshots (YYYY-MM-DD.json) found in evidence directory "${dir}".`);
  }
  return dates[dates.length - 1];
}

function resolveDate(dir: string, requested?: string): string {
  if (!requested) return getLatestDate(dir);
  const dates = listSnapshotDates(dir);
  if (!dates.includes(requested)) {
    throw new Error(
      `No snapshot for date "${requested}". Available: ${dates.length ? dates.join(', ') : 'none'}.`,
    );
  }
  return requested;
}

export function listSnapshots(dir: string): SnapshotSummary[] {
  return listSnapshotDates(dir).map((date) => {
    const snapshot = readSnapshotFile(dir, date);
    return {
      date,
      file: `${date}.json`,
      schema_version: snapshot.schema_version,
      captured_at: snapshot.captured_at,
      source: snapshot.source,
      base_currency: snapshot.base_currency,
      account_count: snapshot.accounts.length,
    };
  });
}

function totalsByCurrency(accounts: Account[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const account of accounts) {
    totals[account.currency] = (totals[account.currency] || 0) + account.balance;
  }
  for (const key of Object.keys(totals)) {
    totals[key] = Number(totals[key].toFixed(2));
  }
  return totals;
}

function matchesAccount(account: Account, needle: string): boolean {
  const value = needle.toLowerCase();
  return account.id.toLowerCase() === value || account.name.toLowerCase() === value;
}

export interface BalancesOptions {
  date?: string;
  type?: string;
  account?: string;
  include_accounts?: boolean;
}

export function getBalances(dir: string, options: BalancesOptions = {}): BalancesResult {
  const date = resolveDate(dir, options.date);
  const snapshot = readSnapshotFile(dir, date);

  let accounts = snapshot.accounts;
  if (options.type) {
    const type = options.type.toLowerCase();
    accounts = accounts.filter((account) => account.type?.toLowerCase() === type);
  }
  if (options.account) {
    accounts = accounts.filter((account) => matchesAccount(account, options.account as string));
  }

  const includeAccounts = options.include_accounts !== false;

  return {
    date,
    captured_at: snapshot.captured_at,
    source: snapshot.source,
    base_currency: snapshot.base_currency,
    account_count: accounts.length,
    totals_by_currency: totalsByCurrency(accounts),
    accounts: includeAccounts ? accounts : undefined,
  };
}

export interface AccountOptions {
  account: string;
  date?: string;
  history?: boolean;
}

export function getAccount(dir: string, options: AccountOptions): AccountResult {
  if (!options.account || !options.account.trim()) {
    throw new Error('An account id or name is required.');
  }

  const date = resolveDate(dir, options.date);
  const snapshot = readSnapshotFile(dir, date);
  const account = snapshot.accounts.find((candidate) => matchesAccount(candidate, options.account));

  if (!account) {
    const known = snapshot.accounts.map((candidate) => candidate.name).join(', ');
    throw new Error(
      `No account matching "${options.account}" in snapshot "${date}". Known accounts: ${known || 'none'}.`,
    );
  }

  const result: AccountResult = {
    account,
    date,
    captured_at: snapshot.captured_at,
  };

  if (options.history) {
    const history: AccountHistoryPoint[] = [];
    for (const snapshotDate of listSnapshotDates(dir)) {
      const historic = readSnapshotFile(dir, snapshotDate);
      const match = historic.accounts.find((candidate) => matchesAccount(candidate, options.account));
      if (match) {
        history.push({
          date: historic.date ?? snapshotDate,
          balance: match.balance,
          available: match.available,
          currency: match.currency,
        });
      }
    }
    result.history = history;
  }

  return result;
}
