/**
 * Composio SDK Integration — Gmail OAuth + Tool Execution
 *
 * Handles OAuth connection flows and Gmail operations via Composio.
 * API Docs: https://docs.composio.dev
 *
 * Auth: API key (COMPOSIO_API_KEY env var)
 * Gmail auth config is managed within the Composio dashboard.
 *
 * Setup:
 * 1. Set COMPOSIO_API_KEY in .env.local
 * 2. Configure Gmail integration in Composio dashboard
 * 3. Navigate to Settings > Integrations > Connect Gmail
 */

import { Composio } from "@composio/core";

// ============================================================
// Config
// ============================================================

let client: Composio | null = null;

export function getComposioClient(): Composio {
  if (!client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error("Composio not configured. Set COMPOSIO_API_KEY.");
    client = new Composio({ apiKey });
  }
  return client;
}

export function isComposioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

// ============================================================
// OAuth Flow
// ============================================================

/**
 * The Gmail auth config ID — set in Composio dashboard.
 * Override via COMPOSIO_GMAIL_AUTH_CONFIG env var if needed.
 */
function getGmailAuthConfigId(): string {
  return process.env.COMPOSIO_GMAIL_AUTH_CONFIG ?? "gmail";
}

export async function initiateGmailConnection(params: {
  userId: string;
  redirectUrl: string;
}): Promise<{ redirectUrl: string; connectionId?: string }> {
  const composio = getComposioClient();

  const connection = await composio.connectedAccounts.initiate(
    params.userId,
    getGmailAuthConfigId(),
    { callbackUrl: params.redirectUrl }
  );

  return {
    redirectUrl: connection.redirectUrl ?? "",
    connectionId: connection.id,
  };
}

export async function getConnectionStatus(
  connectedAccountId: string
): Promise<{ status: string; email?: string }> {
  const composio = getComposioClient();

  const account = await composio.connectedAccounts.get(connectedAccountId);

  // Extract email from state or params (depends on Composio version)
  const state = account.state as Record<string, string> | undefined;
  const params = account.params as Record<string, string> | undefined;
  const email = state?.email ?? params?.email;

  return {
    status: account.status ?? "unknown",
    email,
  };
}

// ============================================================
// Gmail Operations (via composio.tools.execute)
// ============================================================

export async function fetchGmailMessages(params: {
  connectedAccountId: string;
  userId: string;
  since?: Date;
  maxResults?: number;
}): Promise<{
  messages: GmailMessage[];
  error?: string;
}> {
  const composio = getComposioClient();

  try {
    const query = params.since
      ? `after:${Math.floor(params.since.getTime() / 1000)}`
      : undefined;

    const result = await composio.tools.execute("GMAIL_LIST_EMAILS", {
      userId: params.userId,
      connectedAccountId: params.connectedAccountId,
      arguments: {
        max_results: params.maxResults ?? 50,
        query,
      },
    });

    const data = result.data as Record<string, unknown> | undefined;
    const rawMessages = (data?.messages ?? []) as Record<string, unknown>[];

    return {
      messages: rawMessages.map(parseGmailMessage),
    };
  } catch (error) {
    return {
      messages: [],
      error: error instanceof Error ? error.message : "Failed to fetch Gmail messages",
    };
  }
}

export async function sendGmailMessage(params: {
  connectedAccountId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const composio = getComposioClient();

  try {
    const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
      userId: params.userId,
      connectedAccountId: params.connectedAccountId,
      arguments: {
        to: params.to,
        subject: params.subject,
        body: params.body,
        thread_id: params.threadId,
      },
    });

    const data = result.data as Record<string, unknown> | undefined;

    return {
      success: true,
      messageId: data?.id as string | undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send Gmail message",
    };
  }
}

export async function searchGmail(params: {
  connectedAccountId: string;
  userId: string;
  query: string;
  maxResults?: number;
}): Promise<{ messages: GmailMessage[]; error?: string }> {
  const composio = getComposioClient();

  try {
    const result = await composio.tools.execute("GMAIL_LIST_EMAILS", {
      userId: params.userId,
      connectedAccountId: params.connectedAccountId,
      arguments: {
        query: params.query,
        max_results: params.maxResults ?? 20,
      },
    });

    const data = result.data as Record<string, unknown> | undefined;
    const rawMessages = (data?.messages ?? []) as Record<string, unknown>[];

    return {
      messages: rawMessages.map(parseGmailMessage),
    };
  } catch (error) {
    return {
      messages: [],
      error: error instanceof Error ? error.message : "Failed to search Gmail",
    };
  }
}

export async function getGmailThread(params: {
  connectedAccountId: string;
  userId: string;
  threadId: string;
}): Promise<{ messages: GmailMessage[]; error?: string }> {
  const composio = getComposioClient();

  try {
    const result = await composio.tools.execute("GMAIL_GET_THREAD", {
      userId: params.userId,
      connectedAccountId: params.connectedAccountId,
      arguments: {
        thread_id: params.threadId,
      },
    });

    const data = result.data as Record<string, unknown> | undefined;
    const rawMessages = (data?.messages ?? []) as Record<string, unknown>[];

    return {
      messages: rawMessages.map(parseGmailMessage),
    };
  } catch (error) {
    return {
      messages: [],
      error: error instanceof Error ? error.message : "Failed to get Gmail thread",
    };
  }
}

// ============================================================
// Types + Helpers
// ============================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  labels: string[];
}

function parseGmailMessage(raw: Record<string, unknown>): GmailMessage {
  return {
    id: (raw.id as string) ?? "",
    threadId: (raw.threadId as string) ?? (raw.thread_id as string) ?? "",
    from: (raw.from as string) ?? (raw.sender as string) ?? "",
    to: (raw.to as string) ?? (raw.recipient as string) ?? "",
    subject: (raw.subject as string) ?? "",
    body: (raw.body as string) ?? (raw.snippet as string) ?? "",
    date: raw.date ? new Date(raw.date as string) : new Date(),
    labels: (raw.labels as string[]) ?? [],
  };
}
