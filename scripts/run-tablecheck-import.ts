// Mac上でlaunchdから直接実行するスタンドアロンスクリプト。
// 公開アプリはNetlify(サーバーレス)に移行し、tablecheck-inbox/はローカルファイルシステム依存のため
// 公開アプリ側では動かせない。以前はローカルのnext startサーバーをcurlで叩いていたが、
// サーバー自体を停止したため、runTablecheckFolderImport()を直接呼び出す形に変更した(2026-10-07)。
// 接続先DBは.envのDATABASE_URL(Postgres/Neon、公開アプリと共有)。
import { runTablecheckFolderImport } from "../lib/sync/tablecheck-folder-import";

runTablecheckFolderImport()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
