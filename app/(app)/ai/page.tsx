import { ChatPanel } from "@/components/ai/ChatPanel";

export default function NoteAiPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col space-y-4 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">NOTE AI</h1>
        <p className="text-sm text-foreground-muted">PL・顧客データについて自然言語で質問できます。</p>
      </div>
      <ChatPanel />
    </div>
  );
}
