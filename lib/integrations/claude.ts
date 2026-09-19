import "server-only";

// Anthropic Messages API(Claude)のfetchベースの薄いクライアント。
// Notion/Google Sheets/旧Gemini連携と同じ方針で、SDKは追加せず直接REST APIを叩く。

const API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;

export type ClaudeToolDeclaration = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: ClaudeContentBlock[];
};

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEYが設定されていません。設定 → 環境変数を確認してください。");
  }
  return apiKey;
}

function getModel(): string {
  return process.env.CLAUDE_MODEL || "claude-sonnet-5";
}

// 組織に紐づく(ワークスペース未指定の)APIキーの場合、Anthropic側がどのワークスペースの
// 割り当てを使うか判断できず、リクエストにanthropic-workspace-idヘッダーを要求することがある。
// 未設定でもワークスペース紐付き済みのキーであれば問題ないため、設定されている場合のみ付与する。
function getWorkspaceId(): string | undefined {
  return process.env.ANTHROPIC_WORKSPACE_ID || undefined;
}

// Claude側が混雑・過負荷(429/529)の時は、少し待って再試行すれば成功することが多いため、
// 呼び出し元にそのままエラーを返す前に数回だけ再試行する。
export class ClaudeUnavailableError extends Error {}

const RETRYABLE_STATUS = new Set([429, 503, 529]);
const RETRY_DELAYS_MS = [500, 1500, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaude(
  messages: ClaudeMessage[],
  tools: ClaudeToolDeclaration[],
  system: string
): Promise<Response> {
  const apiKey = getApiKey();
  const model = getModel();
  const workspaceId = getWorkspaceId();

  return fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
    },
    cache: "no-store",
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });
}

export type ClaudeMessageResponse = {
  content: ClaudeContentBlock[];
  stopReason: string;
};

export async function generateMessage(
  messages: ClaudeMessage[],
  tools: ClaudeToolDeclaration[],
  system: string
): Promise<ClaudeMessageResponse> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await callClaude(messages, tools, system);

    if (res.ok) {
      const data = await res.json();
      if (!Array.isArray(data.content)) {
        throw new Error("Claude APIから有効な応答が得られませんでした。");
      }
      return { content: data.content as ClaudeContentBlock[], stopReason: data.stop_reason };
    }

    const body = await res.text();
    if (!RETRYABLE_STATUS.has(res.status)) {
      throw new Error(`Claude API error (${res.status}): ${body}`);
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      throw new ClaudeUnavailableError(`Claude API error (${res.status}): ${body}`);
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  // ループは必ず return か throw で終了するため到達しないが、TypeScriptの型上必要。
  throw new ClaudeUnavailableError("Claude APIの呼び出しに失敗しました。");
}
