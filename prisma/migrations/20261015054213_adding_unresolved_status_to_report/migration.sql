-- AlterEnum
ALTER TYPE "public"."ReportStatus" ADD VALUE 'UNRESOLVED';

-- AlterTable
ALTER TABLE "public"."Report" ADD COLUMN     "statusComment" TEXT;
