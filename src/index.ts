#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { fetchTransactions, getCsvUrl, validateTransactions } from './sheets.js';
import { SpendingSummary, Transaction } from './types.js';

const server = new Server(
  {
    name: 'emma-transactions-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const DEFAULT_SHEET_URL = process.env.EMMA_SHEET_URL || '';
const DEFAULT_SHEET_GID = process.env.EMMA_SHEET_GID || '0';

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties, required };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_transactions',
      description: 'List normalized Emma transactions with optional filters',
      inputSchema: schema({
        sheet_url: { type: 'string', description: 'Google Sheet URL, published CSV URL, or Sheet ID. Optional when EMMA_SHEET_URL is set.' },
        gid: { type: 'string', description: 'Google Sheet tab gid. Defaults to 0.' },
        category: { type: 'string', description: 'Case-insensitive category filter.' },
        account: { type: 'string', description: 'Case-insensitive account filter.' },
        search: { type: 'string', description: 'Case-insensitive text search across description, merchant, category, and notes.' },
        from: { type: 'string', description: 'Inclusive lower date bound. Works best with ISO dates.' },
        to: { type: 'string', description: 'Inclusive upper date bound. Works best with ISO dates.' },
        limit: { type: 'number', description: 'Maximum transactions returned. Defaults to 50, max 500.' },
      }),
    },
    {
      name: 'get_spending_summary',
      description: 'Summarize income, spending, net movement, and totals by category, account, and month',
      inputSchema: schema({
        sheet_url: { type: 'string', description: 'Google Sheet URL, published CSV URL, or Sheet ID. Optional when EMMA_SHEET_URL is set.' },
        gid: { type: 'string', description: 'Google Sheet tab gid. Defaults to 0.' },
        from: { type: 'string', description: 'Inclusive lower date bound. Works best with ISO dates.' },
        to: { type: 'string', description: 'Inclusive upper date bound. Works best with ISO dates.' },
      }),
    },
    {
      name: 'get_metadata',
      description: 'Return available categories, accounts, currencies, row count, and date range',
      inputSchema: schema({
        sheet_url: { type: 'string', description: 'Google Sheet URL, published CSV URL, or Sheet ID. Optional when EMMA_SHEET_URL is set.' },
        gid: { type: 'string', description: 'Google Sheet tab gid. Defaults to 0.' },
      }),
    },
    {
      name: 'validate_sheet',
      description: 'Fetch and validate that the configured sheet can be parsed without returning transaction rows',
      inputSchema: schema({
        sheet_url: { type: 'string', description: 'Google Sheet URL, published CSV URL, or Sheet ID. Optional when EMMA_SHEET_URL is set.' },
        gid: { type: 'string', description: 'Google Sheet tab gid. Defaults to 0.' },
      }),
    },
  ],
}));

function requireSheetUrl(args: Record<string, unknown> | undefined): string {
  const sheetUrl = (args?.sheet_url as string | undefined) || DEFAULT_SHEET_URL;
  if (!sheetUrl) {
    throw new McpError(ErrorCode.InvalidParams, 'No sheet_url provided and EMMA_SHEET_URL environment variable is not set.');
  }
  return sheetUrl;
}

function withinDateRange(transaction: Transaction, from?: string, to?: string): boolean {
  if (from && transaction.date < from) return false;
  if (to && transaction.date > to) return false;
  return true;
}

function filterTransactions(transactions: Transaction[], args: Record<string, unknown> | undefined): Transaction[] {
  const category = typeof args?.category === 'string' ? args.category.toLowerCase() : undefined;
  const account = typeof args?.account === 'string' ? args.account.toLowerCase() : undefined;
  const search = typeof args?.search === 'string' ? args.search.toLowerCase() : undefined;
  const from = typeof args?.from === 'string' ? args.from : undefined;
  const to = typeof args?.to === 'string' ? args.to : undefined;

  return transactions.filter((transaction) => {
    if (category && transaction.category?.toLowerCase() !== category) return false;
    if (account && transaction.account?.toLowerCase() !== account) return false;
    if (!withinDateRange(transaction, from, to)) return false;
    if (search) {
      const haystack = [transaction.description, transaction.merchant, transaction.category, transaction.account, transaction.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function summarize(transactions: Transaction[]): SpendingSummary {
  const summary: SpendingSummary = {
    total_expenses: 0,
    total_income: 0,
    net: 0,
    by_category: {},
    by_account: {},
    by_month: {},
    count: transactions.length,
  };

  transactions.forEach((transaction) => {
    if (transaction.amount < 0) {
      summary.total_expenses += Math.abs(transaction.amount);
      const category = transaction.category || 'Uncategorized';
      summary.by_category[category] = (summary.by_category[category] || 0) + Math.abs(transaction.amount);
    } else {
      summary.total_income += transaction.amount;
    }

    const account = transaction.account || 'Unknown';
    summary.by_account[account] = (summary.by_account[account] || 0) + transaction.amount;

    const month = transaction.date.slice(0, 7);
    summary.by_month[month] = (summary.by_month[month] || 0) + transaction.amount;
  });

  summary.total_expenses = Number(summary.total_expenses.toFixed(2));
  summary.total_income = Number(summary.total_income.toFixed(2));
  summary.net = Number((summary.total_income - summary.total_expenses).toFixed(2));
  Object.keys(summary.by_category).forEach((key) => {
    summary.by_category[key] = Number(summary.by_category[key].toFixed(2));
  });
  Object.keys(summary.by_account).forEach((key) => {
    summary.by_account[key] = Number(summary.by_account[key].toFixed(2));
  });
  Object.keys(summary.by_month).forEach((key) => {
    summary.by_month[key] = Number(summary.by_month[key].toFixed(2));
  });

  return summary;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const argRecord = args as Record<string, unknown> | undefined;

  try {
    const sheetUrl = requireSheetUrl(argRecord);
    const gid = (argRecord?.gid as string | undefined) || DEFAULT_SHEET_GID;
    const transactions = await fetchTransactions(getCsvUrl(sheetUrl, gid));

    switch (name) {
      case 'list_transactions': {
        const limit = Math.min(Math.max(Number(argRecord?.limit ?? 50), 1), 500);
        const filtered = filterTransactions(transactions, argRecord).slice(0, limit);
        return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
      }

      case 'get_spending_summary': {
        const filtered = filterTransactions(transactions, argRecord);
        return { content: [{ type: 'text', text: JSON.stringify(summarize(filtered), null, 2) }] };
      }

      case 'get_metadata':
      case 'validate_sheet': {
        return { content: [{ type: 'text', text: JSON.stringify(validateTransactions(transactions), null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    if (error instanceof McpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Emma Transactions MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
