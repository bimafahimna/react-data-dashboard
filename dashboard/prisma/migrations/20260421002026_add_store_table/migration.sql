/*
  Warnings:

  - A unique constraint covering the columns `[accountId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountId" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "Store" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
