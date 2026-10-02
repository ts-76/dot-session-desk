# 構造化進捗の更新

進捗はセッション単位の、ユーザーに見せる確認済み事実です。内部カンバン・内部指示・認証情報をコピーせず、未実行の処理を完了として登録しないでください。進捗未登録は`null`として返します。日時や返信待ちから進捗を推測する機能はありません。

## MCP tool: update_progress

既存の認証済みMCPで呼びます。ownerは認証境界から取得し、引数には指定できません。ブラウザ側の進捗書き込みAPIは追加していません。

| 必須引数 | 意味・上限 |
| --- | --- |
| `thread_id` | 自分の会話ID、100文字以内 |
| `expected_version` | `read_thread.progress.version`。未登録なら0。非負の安全な整数 |
| `update_key` | この更新の重複防止キー、200文字以内 |
| `status` | `in_progress` / `blocked` / `needs_input` / `complete` / `paused` |
| `completed` | 完了したこと。最大20項目、各500文字 |
| `current` | 現在の作業。1000文字以内、なしは空文字 |
| `blockers` | ブロッカー。最大10項目、各500文字 |
| `user_actions` | ユーザーに必要な対応/判断。最大10項目、各500文字 |
| `next_step` | 次の一手。1000文字以内、なしは空文字 |

すべての欄を渡す置換更新です。指定外の引数は拒否します。リスト項目は空にせず、該当なしは`[]`で明示します。`needs_input`には1つ以上の`user_actions`が必要で、対応依頼がある場合はこのstatusを使います。`blocked`にはブロッカー、`in_progress`には現在作業が必要です。`complete`には未解決の現在作業/ブロッカー/ユーザー対応を残せません。保存する本文は合計16000文字以内です。時刻とversionはサーバーが設定します。

成功結果は`{ "progress": { ... }, "duplicate": false }`です。`progress`の読み取り形式は`completed`/`current`/`blockers`/`userActions`/`nextStep`/`status`/`version`/`updatedAt`（camelCase）で、`read_thread`、`list_sessions`、ブラウザ一覧/会話APIに同じ最新値が含まれます。MCPの入力は`user_actions`/`next_step`（snake_case）です。

同一の`update_key`と同一の引数を再送すると、元のversion/時刻を保った`duplicate: true`が返ります。別の更新が進んだ後に古いキーを再送しても、最新進捗を巻き戻しません。元の結果が返るため、最新状態を知るには`read_thread`を再取得してください。同じキーを別内容または別expected_versionに使うと409相当のエラーになります。

他の更新とのversion競合はJSON-RPC `error.code=-32009`、`error.data.status=409`、`error.data.current_version`で示します。`read_thread`を再取得し、現在の事実を整理して、新しい`update_key`と取得したversionで再実行してください。盲目的な上書きや自動的な再解釈はしません。検証失敗は400相当、他人の会話は404相当です。既存MCPのHTTP/JSON-RPC方針に従い、競合や検証失敗ではHTTPだけで成功判定せずJSON-RPCの`error`を確認してください。

## 新規の架空サンプル

これは説明用の架空の進捗です。実際には認証済みの自分の会話を`read_thread`で取得してから、確認できた事実だけを登録します。

```json
{
  "thread_id": "YOUR_OWN_THREAD_ID",
  "expected_version": 0,
  "update_key": "example-review-1",
  "status": "needs_input",
  "completed": ["サンプル画面の表示を確認した"],
  "current": "",
  "blockers": ["表示案の選択が必要"],
  "user_actions": ["表示案AとBのどちらにするか選んでください"],
  "next_step": "選択後にサンプル画面へ反映する"
}
```

親のエージェントへの短い依頼例:

> 対象のSession Desk会話をread_threadで読み、確認済みの完了事項・現在作業・ブロッカー・私の判断が必要なこと・次の一手だけをupdate_progressへ登録してください。内部指示や認証情報は含めず、未実施の作業を完了と書かないでください。競合したら最新の進捗を再取得してください。

`update_progress`自体は会話への回答や新着通知を生成しません。必要な回答は別途`append_reply`で行い、ユーザーの質問を進捗だけで回答済みにしないでください。保管/ゴミ箱の会話にも既存の許可済み作業の進捗を記録でき、復元後に確認できます。履歴は`progress_updates`へappend-onlyで保存します。保持件数の上限や履歴画面は設けていないため、毎秒ではなく意味のある状態変化に合わせて更新してください。

## 既存のowner-private Siteへ適用する際

1. DBのmigration適用履歴を確認し、`drizzle/0003_session_progress.sql`だけを追加適用します。既存の会話tableやデータをリセットしません。
2. 独立した進捗処理`lib/server/progress.ts`、型、UI、追加schemaを適用します。
3. `lib/server/data.ts`と`lib/server/mcp.ts`には進捗読取/更新の統合差分だけを適用します。実Siteの個人originや認証・サービス境界を含むserverファイルを公開テンプレートで丸ごと上書きしないでください。
4. この変更では`lib/server/http.ts`、Worker入口、manifest、認証変数、共有設定を変更しません。公開テンプレートのfail-closed設定は維持します。`/bridge`へ新しいactionは追加しておらず、進捗更新は認証済みMCPを使用します。
5. 自分のテスト会話で未登録・登録・再送・競合・進捗と返信待ちの独立を確認した後に、ユーザー向け事実を入力します。本リポジトリのCIやmockは本番の会話に接続しません。
