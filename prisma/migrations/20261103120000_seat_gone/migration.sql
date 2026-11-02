-- 公開で席がなくなった人へのお知らせ用
ALTER TABLE "VoPresence" ADD COLUMN "seatGone" BOOLEAN NOT NULL DEFAULT false;
