import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchTransactions, getCsvUrl, parseAmount, parseTransactionsFromCsv, validateTransactions } from './sheets.js';

vi.mock('axios');

const syntheticCsv = `Date,Description,Amount,Currency,Category,Account,Merchant,Notes,Type
2026-01-01,Example Grocery,-15.50,GBP,Food,Current Account,Example Grocer,,Expense
2026-01-02,Example Salary,2500.00,GBP,Income,Current Account,Example Employer,,Income
2026-02-03,Example Subscription,-9.99,GBP,Entertainment,Credit Card,Example Streaming,,Expense
`;

describe('Google Sheets URL conversion', () => {
  it('constructs CSV export URLs from sheet IDs and standard sheet URLs', () => {
    const id = '1abc123_dummy_id_this_is_a_long_enough_id_for_regex';
    expect(getCsvUrl(id)).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);

    const url = 'https://docs.google.com/spreadsheets/d/example-sheet-id/edit#gid=123';
    expect(getCsvUrl(url, '456')).toBe('https://docs.google.com/spreadsheets/d/example-sheet-id/export?format=csv&gid=456');
  });

  it('preserves already-exportable CSV URLs', () => {
    const published = 'https://docs.google.com/spreadsheets/d/e/example/pub?output=csv';
    expect(getCsvUrl(published)).toBe(published);

    const exportUrl = 'https://docs.google.com/spreadsheets/d/example/export?format=csv&gid=7';
    expect(getCsvUrl(exportUrl)).toBe(exportUrl);
  });
});

describe('transaction parsing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses normalized transaction data without real banking fixtures', () => {
    const transactions = parseTransactionsFromCsv(syntheticCsv);

    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({
      description: 'Example Grocery',
      amount: -15.5,
      type: 'Expense',
      account: 'Current Account',
    });
    expect(transactions[1]).toMatchObject({
      description: 'Example Salary',
      amount: 2500,
      type: 'Income',
    });
  });

  it('supports common alternate Emma-style column names', () => {
    const csv = `Transaction Date,Name,Value,Currency Code,Emma Category,Account Name\n2026-03-01,Alt Columns,(12.34),GBP,Transport,Travel Card`;
    const [transaction] = parseTransactionsFromCsv(csv);

    expect(transaction).toMatchObject({
      date: '2026-03-01',
      description: 'Alt Columns',
      amount: -12.34,
      category: 'Transport',
      account: 'Travel Card',
    });
  });

  it('defaults missing optional columns safely', () => {
    const transactions = parseTransactionsFromCsv(`Date,Description,Amount\n2026-01-01,Minimal,10.00`);

    expect(transactions[0].currency).toBe('GBP');
    expect(transactions[0].type).toBe('Income');
  });

  it('throws a useful error for missing required columns', () => {
    expect(() => parseTransactionsFromCsv(`Date,Description\n2026-01-01,No amount`)).toThrow(/missing required columns/i);
  });

  it('parses currency symbols, commas, negatives, and accounting parentheses', () => {
    expect(parseAmount('£1,234.56')).toBe(1234.56);
    expect(parseAmount('-£1,234.56')).toBe(-1234.56);
    expect(parseAmount('(£42.10)')).toBe(-42.1);
  });

  it('fetches and parses CSV from a URL', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: syntheticCsv });

    const transactions = await fetchTransactions('https://example.invalid/export.csv');

    expect(axios.get).toHaveBeenCalledWith('https://example.invalid/export.csv', { responseType: 'text' });
    expect(transactions).toHaveLength(3);
  });
});

describe('validation metadata', () => {
  it('returns safe metadata without transaction rows', () => {
    const transactions = parseTransactionsFromCsv(syntheticCsv);
    const validation = validateTransactions(transactions);

    expect(validation).toMatchObject({
      ok: true,
      count: 3,
      accounts: ['Credit Card', 'Current Account'],
      categories: ['Entertainment', 'Food', 'Income'],
      currencies: ['GBP'],
      date_range: { first: '2026-01-01', last: '2026-02-03' },
    });
  });
});
