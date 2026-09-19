import "server-only";

// Google Gemini API(無料枠)のfetchベースの薄いクライアント。
// Notion/Google Sheets連携と同じ方針で、SDKは追加せず直接REST APIを叩く。

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEYが設定されていません。設定 → 環境変数を確認してください。");
  }
  return apiKey;
}

function getModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

// Gemini側が混雑している時の一時的な503(UNAVAILABLE)は、少し待って再試行すれば
// 成功することが多いため、呼び出し元にそのままエラーを返す前に数回だけ再試行する。
export class GeminiUnavailableError extends Error {}

const RETRYABLE_STATUS = new Set([429, 503]);
const RETRY_DELAYS_MS = [500, 1500, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  contents: GeminiContent[],
  functionDeclarations: GeminiFunctionDeclaration[],
  systemInstruction: string
): Promise<Response> {
  const apiKey = getApiKey();
  const model = getModel();

  return fetch(`${API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      contents,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      systemInstruction: { role: "user", parts: [{ text: systemInstruction }] },
    }),
  });
}

export async function generateContent(
  contents: GeminiContent[],
  functionDeclarations: GeminiFunctionDeclaration[],
  systemInstruction: string
): Promise<GeminiContent> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await callGemini(contents, functionDeclarations, systemInstruction);

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate?.content) {
        throw new Error("Gemini APIから有効な応答が得られませんでした。");
      }
      return candidate.content as GeminiContent;
    }

    const body = await res.text();
    if (!RETRYABLE_STATUS.has(res.status)) {
      throw new Error(`Gemini API error (${res.status}): ${body}`);
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      throw new GeminiUnavailableError(`Gemini API error (${res.status}): ${body}`);
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  // ループは必ず return か throw で終了するため到達しないが、TypeScriptの型上必要。
  throw new GeminiUnavailableError("Gemini APIの呼び出しに失敗しました。");
}
