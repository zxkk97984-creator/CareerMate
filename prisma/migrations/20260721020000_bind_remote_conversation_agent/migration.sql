-- A remote TBox conversation is valid only for the Agent application/version
-- that created it. Existing remote IDs remain intentionally unbound so the
-- first V2 request starts a fresh provider conversation.
ALTER TABLE "ChatConversation" ADD COLUMN "remoteAgentId" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN "remoteAgentVersion" TEXT;
