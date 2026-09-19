// 2026-09-20、ユーザー判断によりAIチャット(Gemini連携)を停止した。
// ナビゲーション・検索からは既に外しているが、URLを直接開かれた場合に備えてこのページ自体にも
// 停止中の案内を表示する(コード自体は再開に備えて残す)。
export default function NoteAiPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col space-y-4 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">NOTE AI</h1>
        <p className="text-sm text-foreground-muted">
          現在、AIチャット機能は停止しています。ご利用にはお問い合わせください。
        </p>
      </div>
    </div>
  );
}
