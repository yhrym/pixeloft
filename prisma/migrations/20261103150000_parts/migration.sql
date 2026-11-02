-- みんなのパーツ(髪型・服・小物のドット絵)
CREATE TABLE "VoPart" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VoPart_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoPart_createdById_idx" ON "VoPart"("createdById");

ALTER TABLE "VoPart" ADD CONSTRAINT "VoPart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
