-- CreateTable
CREATE TABLE "system_metadata" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("key")
);
