import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { AI_TOOL_DECLARATIONS, executeAiTool } from "@/lib/ai/tools";

// NOTE AIのPL・予約データを、手元のClaude(Claude Desktop、Claude Code等)から直接
// 問い合わせられるようにするMCP(Model Context Protocol)サーバー。
// 既存のAIチャット(lib/ai/tools.ts)と全く同じツール定義・実装を再利用しており、
// 個人情報(氏名・電話番号)は一切返さない読み取り専用ツールのみを公開する。
//
// Streamable HTTPトランスポート(仕様: https://modelcontextprotocol.io/specification)の
// うち、このサーバーが実際に必要とする範囲(initialize・tools/list・tools/call、いずれも
// リクエスト/レスポンス形式でサーバー側からの非同期通知は不要)だけを自前実装している。
// Notion/Google Sheets/Claude連携と同じ方針でSDKは追加せず、JSON-RPCメッセージを直接処理する。
// セッションは持たない(ステートレス。仕様上サーバーがセッション管理を要求しないことは許容されている)。

const PROTOCOL_VERSION_FALLBACK = "2025-06-18";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function isAuthorized(auth: string | null): boolean {
  const secret = process.env.MCP_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(auth ?? "");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

const MCP_TOOLS = AI_TOOL_DECLARATIONS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input_schema,
}));

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request");
  }

  // 通知(idを持たないメッセージ、例: notifications/initialized)には応答本文を返さない。
  const isNotification = body.id === undefined;

  switch (body.method) {
    case "initialize": {
      const clientProtocolVersion =
        typeof body.params?.protocolVersion === "string"
          ? body.params.protocolVersion
          : PROTOCOL_VERSION_FALLBACK;
      return rpcResult(body.id, {
        protocolVersion: clientProtocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "note-ai", version: "1.0.0" },
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      // 通知は受理するのみで、応答は返さない(202 No Content相当)。
      return new NextResponse(null, { status: 202 });

    case "ping":
      return rpcResult(body.id, {});

    case "tools/list":
      return rpcResult(body.id, { tools: MCP_TOOLS });

    case "tools/call": {
      const toolName = body.params?.name;
      const args = (body.params?.arguments as Record<string, unknown> | undefined) ?? {};
      if (typeof toolName !== "string") {
        return rpcError(body.id, -32602, "Invalid params: name is required");
      }
      try {
        const result = await executeAiTool(toolName, args);
        return rpcResult(body.id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
        });
      } catch (err) {
        return rpcResult(body.id, {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return new NextResponse(null, { status: 202 });
      return rpcError(body.id, -32601, `Method not found: ${body.method}`);
  }
}

// このサーバーはストリーミング(サーバー起点のSSE)もセッション終了も提供しないステートレス実装のため、
// GET(SSEストリーム開始)・DELETE(セッション終了)には明示的に非対応として返す。
export async function GET() {
  return NextResponse.json({ error: "この MCP サーバーはステートレスで、SSEストリームには対応していません。" }, { status: 405 });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405 });
}
