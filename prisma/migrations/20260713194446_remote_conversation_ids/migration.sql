-- AlterTable
ALTER TABLE "OnboardingConversation" ADD COLUMN "remoteConversationId" TEXT;

-- AlterTable
ALTER TABLE "SimulationSession" ADD COLUMN "remoteConversationId" TEXT;
