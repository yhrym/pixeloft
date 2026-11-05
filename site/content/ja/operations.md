---
title: 運用
order: 6
description: バックアップと復元、更新、appを1プロセスで動かす理由、TRUSTED_PROXYとログインの回数制限について。
---
## バックアップと復元

データはすべてPostgreSQLのボリューム`pgdata`にあります。

```sh
# バックアップ
docker compose exec -T db pg_dump -U vo -Fc vo > pixeloft.dump

# 復元（動いているデータベースへ。空でも既存でも可）
docker compose stop app
docker compose exec -T db pg_restore -U vo -d vo --clean --if-exists < pixeloft.dump
docker compose start app
```

## 更新

```sh
git pull
docker compose up -d --build
```

データベースのマイグレーションはappコンテナの起動時に自動で走ります。

## appを1プロセスで動かす理由

`app`コンテナは1つだけにしてください。1秒の状態キャッシュ、エモート、ハートビートの間引き、ログインの回数制限はプロセスのメモリ上にあるため、2つ動かすと食い違います。

## TRUSTED_PROXYとログインの回数制限

同じキーでのログイン失敗が15分間に10回に達すると、その15分の枠が終わるまで、それ以降のログインを受け付けません。キーは次のとおりです。

- **`TRUSTED_PROXY`がないとき**、アプリはクライアントを区別できないので、失敗の回数をログインIDだけで数えます。IDを知っている人がわざと間違えると、その15分の枠が終わるまで、そのIDでログインできなくなります。
- **`TRUSTED_PROXY=1`のとき**、アプリはクライアントのアドレスを`X-Forwarded-For`（プロキシが追加した最後の値）から取り、失敗の回数をIDとアドレスの組で数えます。書き込みのオリジン確認も`X-Forwarded-Host`と`X-Forwarded-Proto`を見るようになります。

すべてのリクエストが確実にプロキシを通る場合にだけ設定してください。アプリはポート3000に届いたヘッダーを、誰が送ったものでも信用します。そのポートへ直接アクセスできないように、ファイアウォールで止めるか、composeの上書きで`127.0.0.1`にだけ公開してください。Caddyの例は[通話と通知](../calls/)にあります。

## 開発

```sh
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npx prisma migrate deploy
npm run dev
```

`docker-compose.dev.yml`は、データベースを`127.0.0.1:${DB_PORT:-5432}`に公開します。5432が使用中なら`DB_PORT=55432`で起動し、`.env`の`DATABASE_URL`のポートも合わせてください。
