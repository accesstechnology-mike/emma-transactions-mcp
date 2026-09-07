#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { getAccount, getBalances, listSnapshots, resolveEvidenceDir } from './evidence.js';

const server = new Server(
  {
    name: 'emma-balances-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties, required };
}

const evidenceDirProp = {
  evidence_dir: {
    type: 'string',
    description:
      'Directory of YYYY-MM-DD.json balance snapshots. Optional when EMMA_EVIDENCE_DIR is set.',
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_snapshots',
      description:
        'List the available balance snapshots (dates) found in the evidence directory, with per-snapshot metadata.',
      inputSchema: schema({
        ...evidenceDirProp,
      }),
    },
    {
      name: 'get_balances',
      description:
        'Return account balances for a snapshot (defaults to the most recent) with totals by currency.',
      inputSchema: schema({
        ...evidenceDirProp,
        date: {
          type: 'string',
          description: 'Snapshot date (YYYY-MM-DD). Defaults to the most recent snapshot.',
        },
        type: { type: 'string', description: 'Case-insensitive account type filter, e.g. "current".' },
        account: {
          type: 'string',
          description: 'Case-insensitive account id or name filter.',
        },
        include_accounts: {
          type: 'boolean',
          description: 'Include the per-account rows in the result. Defaults to true.',
        },
      }),
    },
    {
      name: 'get_account',
      description:
        'Return a single account for a snapshot (defaults to the most recent), optionally with its balance history across all snapshots.',
      inputSchema: schema(
        {
          ...evidenceDirProp,
          account: { type: 'string', description: 'Account id or name (case-insensitive).' },
          date: {
            type: 'string',
            description: 'Snapshot date (YYYY-MM-DD). Defaults to the most recent snapshot.',
          },
          history: {
            type: 'boolean',
            description: 'Include the balance history for this account across all snapshots.',
          },
        },
        ['account']
      ),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const argRecord = args as Record<string, unknown> | undefined;

  try {
    const dir = resolveEvidenceDir(argRecord?.evidence_dir as string | undefined);

    switch (name) {
      case 'list_snapshots': {
        return { content: [{ type: 'text', text: JSON.stringify(listSnapshots(dir), null, 2) }] };
      }

      case 'get_balances': {
        const result = getBalances(dir, {
          date: argRecord?.date as string | undefined,
          type: argRecord?.type as string | undefined,
          account: argRecord?.account as string | undefined,
          include_accounts: argRecord?.include_accounts as boolean | undefined,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_account': {
        const account = argRecord?.account as string | undefined;
        if (!account) {
          throw new McpError(ErrorCode.InvalidParams, 'The "account" argument is required.');
        }
        const result = getAccount(dir, {
          account,
          date: argRecord?.date as string | undefined,
          history: argRecord?.history as boolean | undefined,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
  console.error('Emma Balances MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
