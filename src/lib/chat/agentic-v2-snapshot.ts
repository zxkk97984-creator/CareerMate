import { getPrisma } from "@/lib/prisma";
import type { AgenticV2Interaction } from "./agentic-v2-context";
import type { ProfileSnapshotV1, HistorySnapshotV1, SimulationStateV1 } from "@/lib/agentic-v2/contracts";

// ── 限制常量 ──────────────────────────────────────────────
const LIMITS = {
  evidence: 20,
  progress: 20,
  simulations: 5,
  transcriptItems: 12,
  memories: 10,
  text: 1_500,
  bytes: 49_152,
} as const;

// ── 数据库接口 ────────────────────────────────────────────
export interface SnapshotDatabase {
  userProfile: {
    findUnique(args: {
      where: { userId: string };
      select: Record<string, boolean>;
    }): Promise<Record<string, unknown> | null>;
  };
  abilityEvidence: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
  careerPlan: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
    }): Promise<Record<string, unknown> | null>;
  };
  progressLog: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
  simulationSession: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null>;
  };
  memoryItem: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
  chatConversation: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { summary: true; contextVersion: true };
    }): Promise<{ summary: string; contextVersion: number } | null>;
  };
}

// ── 错误类型 ──────────────────────────────────────────────
export class AgenticV2SnapshotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AgenticV2SnapshotError";
  }
}

// ── 工具函数 ──────────────────────────────────────────────
function truncateText(value: unknown, max = LIMITS.text): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── 输入输出类型 ──────────────────────────────────────────
export interface LoadAgenticV2SnapshotInput {
  userId: string;
  conversationId: string;
  interaction?: AgenticV2Interaction;
}

export interface LoadAgenticV2SnapshotResult {
  profileSnapshot: ProfileSnapshotV1;
  historySnapshot: HistorySnapshotV1;
  simulationState: SimulationStateV1 | null;
}

// ── 主入口 ────────────────────────────────────────────────
export async function loadAgenticV2Snapshot(
  input: LoadAgenticV2SnapshotInput,
  dependencies: { db?: SnapshotDatabase; now?: () => Date } = {},
): Promise<LoadAgenticV2SnapshotResult> {
  const db = dependencies.db ?? (getPrisma() as unknown as SnapshotDatabase);
  const now = dependencies.now ?? (() => new Date());

  // 1. 用户画像 — 仅取必要字段
  const profileRow = await db.userProfile.findUnique({
    where: { userId: input.userId },
    select: {
      targetRole: true,
      targetRoleLabel: true,
      weeklyAvailableHours: true,
      learningPreference: true,
      experienceSummary: true,
      interestTags: true,
      constraints: true,
      abilityScores: true,
      memoryEnabled: true,
      onboardingCompleted: true,
      version: true,
      educationStage: true,
      major: true,
    },
  });

  const profileAvailable = profileRow !== null;
  const profileVersion = profileRow ? (profileRow.version as number) : null;
  const profileData = profileAvailable
    ? {
        targetRole: truncateText(profileRow!.targetRole) || null,
        targetRoleLabel: truncateText(profileRow!.targetRoleLabel) || null,
        weeklyAvailableHours: typeof profileRow!.weeklyAvailableHours === "number"
          ? profileRow!.weeklyAvailableHours
          : null,
        educationStage: truncateText(profileRow!.educationStage) || null,
        major: truncateText(profileRow!.major) || null,
        learningPreference: safeJson(profileRow!.learningPreference as string, []),
        experienceSummary: truncateText(profileRow!.experienceSummary),
        interestTags: safeJson(profileRow!.interestTags as string, []),
        constraints: safeJson(profileRow!.constraints as string, []),
        abilityScores: safeJson(profileRow!.abilityScores as string, {}),
        abilityEvidence: [] as unknown[],
        onboardingCompleted: (profileRow!.onboardingCompleted as boolean) ?? false,
      }
    : {};

  // 2. 已确认的能力证据
  const evidenceRows = profileAvailable
    ? await db.abilityEvidence.findMany({
        where: { userId: input.userId, status: "confirmed" },
        orderBy: { observedAt: "desc" },
        take: LIMITS.evidence,
      })
    : [];

  const abilityEvidence = evidenceRows.map((row) => ({
    abilityKey: String(row.abilityKey ?? ""),
    summary: truncateText(row.summary),
    sourceType: String(row.sourceType ?? ""),
    sourceRef: row.sourceRef ? truncateText(row.sourceRef) : null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    observedAt: row.observedAt instanceof Date
      ? row.observedAt.toISOString()
      : String(row.observedAt ?? ""),
  }));

  if (profileAvailable && profileData && typeof profileData === "object") {
    (profileData as Record<string, unknown>).abilityEvidence = abilityEvidence;
  }

  // 3. 活动计划
  const activePlanRow = profileAvailable
    ? await db.careerPlan.findFirst({
        where: { userId: input.userId, status: "active" },
        orderBy: { version: "desc" },
      })
    : null;

  const activePlan = activePlanRow
    ? {
        id: truncateText(activePlanRow.id),
        version: typeof activePlanRow.version === "number" ? activePlanRow.version : 1,
        targetRole: truncateText(activePlanRow.targetRole),
        targetRoleLabel: truncateText(activePlanRow.targetRoleLabel) || null,
        currentMonthIndex: typeof activePlanRow.currentMonthIndex === "number"
          ? activePlanRow.currentMonthIndex
          : 1,
        activatedAt: activePlanRow.activatedAt instanceof Date
          ? activePlanRow.activatedAt.toISOString()
          : null,
      }
    : null;

  // 4. 近期进度
  const progressRows = profileAvailable
    ? await db.progressLog.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: "desc" },
        take: LIMITS.progress,
      })
    : [];

  const recentProgress = progressRows.map((row) => ({
    eventType: truncateText(row.eventType),
    title: truncateText(row.title),
    summary: truncateText(row.summary),
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt ?? ""),
  }));

  // 5. 最近完成的模拟训练
  const recentSimulationRows = profileAvailable
    ? await db.simulationSession.findMany({
        where: { userId: input.userId, status: "completed" },
        orderBy: { updatedAt: "desc" },
        take: LIMITS.simulations,
      })
    : [];

  const recentSimulations = recentSimulationRows.map((row) => {
    const rawTranscript = safeJson<Array<{ role: string; content: string }>>(
      row.transcript as string,
      [],
    );
    return {
      id: truncateText(row.id),
      scenarioKey: truncateText(row.scenarioKey),
      scenarioTitle: truncateText(row.scenarioTitle),
      score: typeof row.score === "number" ? row.score : null,
      turnCount: typeof row.turnCount === "number" ? row.turnCount : 0,
      transcript: rawTranscript.slice(0, LIMITS.transcriptItems),
      completedAt: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? ""),
    };
  });

  // 6. 已确认记忆（仅限 scope=career, sensitivity=normal, 非过期）
  const memoryEnabled = profileRow
    ? (profileRow.memoryEnabled as boolean) === true
    : false;

  let confirmedMemories: Array<{
    content: string;
    kind: string;
    reason: string;
    createdAt: string;
  }> = [];

  if (profileAvailable && memoryEnabled) {
    const nowDate = now();
    const memoryRows = await db.memoryItem.findMany({
      where: {
        userId: input.userId,
        status: "confirmed",
        scope: "career",
        sensitivity: "normal",
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: nowDate } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: LIMITS.memories,
    });

    confirmedMemories = memoryRows.map((row) => ({
      content: truncateText(row.content),
      kind: truncateText(row.kind),
      reason: truncateText(row.reason),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
    }));
  }

  // 7. 对话摘要
  const conversationRow = await db.chatConversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    select: { summary: true, contextVersion: true },
  });

  const conversationSummary = truncateText(conversationRow?.summary ?? "");
  const contextVersion = conversationRow?.contextVersion ?? 1;

  // 8. 模拟训练状态
  const targetRef = input.interaction?.targetRef;
  let simulationState: SimulationStateV1 | null = null;

  if (targetRef && input.interaction?.surface === "simulation") {
    const sessionRow = await db.simulationSession.findFirst({
      where: { id: targetRef, userId: input.userId },
    });

    if (sessionRow) {
      const rawTranscript = safeJson<Array<{ role: string; content: string }>>(
        sessionRow.transcript as string,
        [],
      );

      simulationState = {
        sessionId: truncateText(sessionRow.id),
        scenarioKey: truncateText(sessionRow.scenarioKey),
        status: truncateText(sessionRow.status),
        round: typeof sessionRow.turnCount === "number" ? sessionRow.turnCount : 0,
        transcript: rawTranscript.slice(0, LIMITS.transcriptItems),
      };
    }
  }

  // ── 组装 DTO ──────────────────────────────────────────
  const profileSnapshot: ProfileSnapshotV1 = {
    available: profileAvailable,
    version: profileVersion,
    data: profileData,
  };

  const throughDate = now().toISOString();

  const historySnapshot: HistorySnapshotV1 = {
    available: true,
    through: throughDate,
    data: {
      activePlan,
      recentProgress,
      recentSimulations,
      confirmedMemories,
      conversationSummary,
      contextVersion,
    },
  };

  const result: LoadAgenticV2SnapshotResult = {
    profileSnapshot,
    historySnapshot,
    simulationState,
  };

  // ── 字节预算控制 ──────────────────────────────────────
  let serialized = JSON.stringify(result);
  let byteSize = Buffer.byteLength(serialized, "utf8");

  if (byteSize > LIMITS.bytes) {
    // 第1级：缩减模拟转录条目
    if (simulationState && simulationState.transcript.length > 6) {
      simulationState = {
        ...simulationState,
        transcript: simulationState.transcript.slice(0, 6),
      };
    }
    for (const sim of recentSimulations) {
      if (sim.transcript.length > 6) {
        sim.transcript = sim.transcript.slice(0, 6);
      }
    }
    serialized = JSON.stringify({ ...result, simulationState });
    byteSize = Buffer.byteLength(serialized, "utf8");
  }

  if (byteSize > LIMITS.bytes) {
    // 第2级：缩减进度条目
    historySnapshot.data.recentProgress = recentProgress.slice(0, 10);
    serialized = JSON.stringify({ ...result, historySnapshot });
    byteSize = Buffer.byteLength(serialized, "utf8");
  }

  if (byteSize > LIMITS.bytes) {
    // 第3级：缩减能力证据
    profileData.abilityEvidence = abilityEvidence.slice(0, 10);
    serialized = JSON.stringify({ ...result, profileSnapshot: { ...profileSnapshot, data: profileData } });
    byteSize = Buffer.byteLength(serialized, "utf8");
  }

  if (byteSize > LIMITS.bytes) {
    // 第4级：缩减记忆
    historySnapshot.data.confirmedMemories = confirmedMemories.slice(0, 5);
    serialized = JSON.stringify({ ...result, historySnapshot });
    byteSize = Buffer.byteLength(serialized, "utf8");
  }

  if (byteSize > LIMITS.bytes) {
    // 第5级：缩减文本字段
    // 此步骤通过重构对象实现，对过大的自由文本截断到 600 字符
    const reducedProfileData = { ...profileData };
    for (const key of Object.keys(reducedProfileData)) {
      const val = (reducedProfileData as Record<string, unknown>)[key];
      if (typeof val === "string" && val.length > 600) {
        (reducedProfileData as Record<string, unknown>)[key] = val.slice(0, 600);
      }
    }
    serialized = JSON.stringify({
      ...result,
      profileSnapshot: { ...profileSnapshot, data: reducedProfileData },
    });
    byteSize = Buffer.byteLength(serialized, "utf8");
  }

  if (byteSize > LIMITS.bytes) {
    throw new AgenticV2SnapshotError(
      `Snapshot exceeds ${LIMITS.bytes} byte budget after all reduction steps (final: ${byteSize} bytes)`,
      "SNAPSHOT_TOO_LARGE",
    );
  }

  return result;
}
