"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runChat, type ChatMessage } from "@/lib/ai/chat";
import { GeminiUnavailableError } from "@/lib/integrations/gemini";

export type SendChatMessageResult = { ok: true; reply: string } | { ok: false; error: string };

// メッセージ長・送信頻度の上限。無ければ誰でも無制限にGemini APIを呼び出せてしまうため
// (セキュリティ監査finding: ai-chat-no-rate-limit)。
const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 20;

/** ユーザーごとの直近ウィンドウでの送信回数を確認・加算する。上限超過ならfalseを返す。 */
async function consumeRateLimit(userId: string): Promise<boolean> {
  const now = new Date();
  const usage = await prisma.chatUsage.upsert({
    where: { userId },
    update: {},
    create: { userId, windowStart: now, count: 0 },
  });

  if (now.getTime() - usage.windowStart.getTime() > RATE_LIMIT_WINDOW_MS) {
    await prisma.chatUsage.update({ where: { userId }, data: { windowStart: now, count: 1 } });
    return true;
  }

  if (usage.count >= RATE_LIMIT_MAX_MESSAGES) {
    return false;
  }

  await prisma.chatUsage.update({ where: { userId }, data: { count: { increment: 1 } } });
  return true;
}

export async function sendChatMessageAction(
  history: ChatMessage[],
  message: string
): Promise<SendChatMessageResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "ログインが必要です。" };
  }
  if (!message.trim()) {
    return { ok: false, error: "質問を入力してください。" };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `メッセージは${MAX_MESSAGE_LENGTH}文字以内で入力してください。` };
  }
  if (!(await consumeRateLimit(session.userId))) {
    return {
      ok: false,
      error: "短時間に多くのメッセージが送信されました。しばらく時間をおいてから再度お試しください。",
    };
  }

  try {
    const reply = await runChat(history, message.trim());
    return { ok: true, reply };
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      console.error("Gemini API unavailable:", err.message);
      return {
        ok: false,
        error: "現在AIサービスが混み合っています。しばらくしてからもう一度お試しください。",
      };
    }
    // Gemini APIの生のエラーレスポンス等、内部実装の詳細をそのままクライアントに返さない
    // (セキュリティ監査finding: gemini-raw-error-leak)。詳細はサーバー側ログにのみ残す。
    console.error("AI chat error:", err);
    return {
      ok: false,
      error: "AIチャットの処理中にエラーが発生しました。しばらくしてからもう一度お試しください。",
    };
  }
}
