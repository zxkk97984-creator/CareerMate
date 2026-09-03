export const clearAccountDataConfirmation = "CLEAR_MY_DATA";

export function isClearConfirmation(value: unknown) {
  return value === clearAccountDataConfirmation;
}

type PrivacySource = {
  user: Record<string, unknown>;
  profile: unknown;
  memories: unknown[];
  plans: unknown[];
  logs: unknown[];
  simulations: unknown[];
  candidates: unknown[];
  onboardingConversations: unknown[];
  conversations: unknown[];
  abilityEvidence: unknown[];
  explorationReports: unknown[];
  artifactCandidates?: unknown[];
  learningRoutes?: unknown[];
  operationExecutions?: unknown[];
  authSessions?: unknown[];
};

export function buildPrivacyExport(source: PrivacySource) {
  const { passwordHash: _passwordHash, ...safeUser } = source.user;
  void _passwordHash;
  return {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    profile: source.profile,
    memories: source.memories,
    plans: source.plans,
    progressLogs: source.logs,
    simulations: source.simulations,
    profileUpdateCandidates: source.candidates,
    onboardingConversations: source.onboardingConversations,
    chatConversations: source.conversations,
    abilityEvidence: source.abilityEvidence,
    careerExplorationReports: source.explorationReports,
    agentArtifactCandidates: source.artifactCandidates ?? [],
    learningRoutes: source.learningRoutes ?? [],
    operationExecutions: source.operationExecutions ?? [],
  };
}
