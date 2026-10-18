-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "feature_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status_reason" TEXT;
