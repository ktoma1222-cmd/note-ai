import "server-only";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function getConfig() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_CUSTOMER_DB_ID;
  if (!apiKey || !databaseId) {
    throw new Error(
      "NOTION_API_KEY / NOTION_CUSTOMER_DB_ID が設定されていません。"
    );
  }
  return { apiKey, databaseId };
}

async function notionFetch(path: string, init?: RequestInit) {
  const { apiKey } = getConfig();
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API error (${res.status}): ${body}`);
  }
  return res.json();
}

export type NotionPropertyValue =
  | { type: "title"; title: { plain_text: string }[] }
  | { type: "rich_text"; rich_text: { plain_text: string }[] }
  | { type: "email"; email: string | null }
  | { type: "phone_number"; phone_number: string | null }
  | { type: "number"; number: number | null }
  | { type: "select"; select: { name: string } | null }
  | { type: "date"; date: { start: string; end: string | null } | null }
  | { type: "created_time"; created_time: string }
  | {
      type: "formula";
      formula:
        | { type: "string"; string: string | null }
        | { type: "number"; number: number | null }
        | { type: "boolean"; boolean: boolean | null }
        | { type: "date"; date: { start: string } | null };
    }
  | { type: string; [key: string]: unknown };

export type NotionPage = {
  id: string;
  properties: Record<string, NotionPropertyValue>;
};

export type NotionDatabaseSchema = {
  title: string;
  properties: Record<
    string,
    { type: string; select?: { options: { name: string }[] } }
  >;
};

export async function getNotionDatabaseSchema(): Promise<NotionDatabaseSchema> {
  const { databaseId } = getConfig();
  const data = await notionFetch(`/databases/${databaseId}`);
  return {
    title: (data.title ?? []).map((t: { plain_text: string }) => t.plain_text).join(""),
    properties: data.properties,
  };
}

/** 店舗名selectプロパティの選択肢一覧(設定画面のマッピングUI用) */
export async function getNotionStoreOptions(): Promise<string[]> {
  const schema = await getNotionDatabaseSchema();
  const prop = schema.properties["店舗名"];
  if (!prop || prop.type !== "select" || !prop.select) return [];
  return prop.select.options.map((o) => o.name);
}

export async function queryNotionDatabase(params: {
  startCursor?: string;
  editedAfter?: string; // ISO日時。指定するとそれ以降に編集された行のみ取得(差分同期用)
}): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor: string | null }> {
  const { databaseId } = getConfig();
  const body: Record<string, unknown> = {
    page_size: 100,
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  };
  if (params.startCursor) body.start_cursor = params.startCursor;
  if (params.editedAfter) {
    body.filter = {
      timestamp: "last_edited_time",
      last_edited_time: { after: params.editedAfter },
    };
  }

  const data = await notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    results: data.results,
    hasMore: data.has_more,
    nextCursor: data.next_cursor,
  };
}

/** 新規ページを作成する(TableCheck予約のNotion同期用、書き込みは今回が初)。 */
export async function createNotionPage(
  properties: Record<string, unknown>
): Promise<{ id: string }> {
  const { databaseId } = getConfig();
  const data = await notionFetch(`/pages`, {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
  return { id: data.id };
}

/** 既存ページのプロパティを更新する。 */
export async function updateNotionPage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<{ id: string }> {
  const data = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
  return { id: data.id };
}

export async function queryAllNotionPages(editedAfter?: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const { results, hasMore, nextCursor } = await queryNotionDatabase({
      startCursor: cursor,
      editedAfter,
    });
    pages.push(...results);
    cursor = hasMore ? nextCursor ?? undefined : undefined;
  } while (cursor);
  return pages;
}
