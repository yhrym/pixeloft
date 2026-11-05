-- プラグインの保存場所
CREATE TABLE "PluginData" (
    "plugin" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginData_pkey" PRIMARY KEY ("plugin","key")
);
