---
title: 運用
order: 6
description: バックアップと復元、更新、appを1プロセスで動かす理由、TRUSTED_PROXYとログインの回数制限。
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

データベースのマイグレーションは、appコンテナの起動時に自動で走ります。

## appは1プロセスだけ

`app`コンテナは必ず1つにしてください。1秒の状態キャッシュ、エモート、ハートビートの間引き、ログインの回数制限はプロセスのメモリにあるので、2つ動かすと食い違います。会社規模のオフィスなら1プロセスで足ります。

## TRUSTED_PROXYとログインの回数制限

ログインは15分に10回まで失敗できます。

- **`TRUSTED_PROXY`がないとき**、アプリはクライアントを見分けられないので、失敗はログインIDだけで数えます。IDを知っている人なら、わざと間違えて、そのアカウントを15分ロックできてしまいます。
- **`TRUSTED_PROXY=1`のとき**、アプリはクライアントのアドレスを`X-Forwarded-For`（プロキシが足した最後の値）から取り、失敗をIDとアドレスの組で数えます。攻撃者がロックできるのは自分だけです。書き込みのオリジン確認も`X-Forwarded-Host`と`X-Forwarded-Proto`を見るようになります。

すべてのリクエストが本当にプロキシを通るときだけ設定してください。アプリはポート3000に届く誰からのヘッダーも信じるので、そのポートへの直接のアクセスはファイアウォールで止めるか、composeの上書きで`127.0.0.1`にだけ開けます。Caddyの例は[通話と通知](../calls/)にあります。

## 開発

```sh
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npx prisma migrate deploy
npm run dev
```

`docker-compose.dev.yml`はデータベースを`127.0.0.1:${DB_PORT:-5432}`に公開します。5432が使用中なら`DB_PORT=55432`で起動し、`.env`の`DATABASE_URL`のポートも合わせてください。
