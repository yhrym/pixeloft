---
title: 通話と通知
order: 5
description: 「ちょっといい？」の声かけ・手振りとWeb Push。Web PushにHTTPSが要る理由とCaddyの例。
---
## 届くもの

- **ちょっといい？**: 同僚への声かけです。相手は「行く」か「あとで」で返せます。
- **手振り**: 軽い挨拶で、振り返すこともできます。

どちらも、オフィスを開いている人の画面に出ます。通知を許可している人には、タブが裏にあるときもWeb Pushで届きます。

## Web PushにはHTTPSが要る

Web Pushとサービスワーカーは、HTTPSか`localhost`でしか動きません。別のホストにHTTPで開いていると、ブラウザは通知を出してくれません。アプリの前にリバースプロキシを置いてください。

### Caddyの例

Caddyなら証明書を自動で取ってくれます。

```
office.example.com {
	reverse_proxy localhost:3000
}
```

そのうえで`.env`に次を書き、`docker compose up -d`をやり直します。

```
APP_URL=https://office.example.com
TRUSTED_PROXY=1
```

`APP_URL`は招待・再設定リンクとWeb Pushの連絡先に使います。`TRUSTED_PROXY`は[運用](../operations/)で説明しています。すべてのリクエストが本当にプロキシを通るときだけ設定してください。

## 通話URL

ビデオ通話や音声通話そのものは別のサービスで行います。[設定](../settings/)で部屋ごとに通話URLを入れると、その部屋に開くボタンが出ます。
