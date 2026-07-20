import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  verifyCareerMateContextToken,
  type CareerMateContextTokenClaims,
  type CareerMateContextTokenScope,
} from "@/lib/agent-context-token";
import {
  AGENT_ARTIFACT_CANDIDATE_TYPES,
  AgentArtifactCandidateError,
  createAgentArtifactCandidateService,
  type AgentArtifactCandidateService,
} from "@/lib/agentic-v2/candidate-service";
import { getPrisma } from "@/lib/prisma";
import { parseSimulationTranscript } from "@/lib/simulation";
import { parseJson } from "@/lib/json";

export const CAREERMATE_V2_TOOL_NAMES = [
  "profile.read",
  "growth_history.read",
  "career_templates.query",
  "learning_resources.query",
  "simulation_state.read",
  "candidate.create",
  "simulation_turn.append",
] as const;

type CareerMateV2ToolName = (typeof CAREERMATE_V2_TOOL_NAMES)[number];

export interface CareerMateV2ToolContext {
  userId: string;
  sessionId: string;
  scopes: readonly CareerMateContextTokenScope[];
  requestId: string;
}

export class CareerMateV2McpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "CareerMateV2McpError";
  }
}

type JsonSchema = Record<string, unknown>;

interface V2ToolDefinition {
  name: CareerMateV2ToolName;
  description: string;
  requiredScope: CareerMateContextTokenScope;
  inputSchema: z.ZodTypeAny;
  inputJsonSchema: JsonSchema;
  handler(input: unknown, context: CareerMateV2ToolContext): Promise<unknown>;
}

interface V2Database {
  userProfile: { findUnique(args: unknown): Promise<Record<string, unknown> | null> };
  abilityEvidence: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
  careerPlan: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
  };
  progressLog: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
  simulationSession: {
    findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  };
  roleTemplate: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
  resourceItem: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
  operationExecution: {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operation: (transaction: V2Database) => Promise<T>): Promise<T>;
}

export interface CareerMateV2RegistryDependencies {
  db?: V2Database;
  verifyToken?: (token: string) => CareerMateContextTokenClaims;
  candidateService?: AgentArtifactCandidateService;
}

const contextTokenJsonSchema = {
  type: "string",
  minLength: 1,
  description: "CareerMate 后端签发的短时上下文令牌；不得由模型自行构造。",
} as const;

function objectJsonSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = [],
): JsonSchema {
  return {
    type: "object",
    required: ["context_token", ...required],
    properties: { context_token: contextTokenJsonSchema, ...properties },
    additionalProperties: false,
  };
}

const withContext = {
  context_token: z.string().trim().min(1).max(4_096),
};

const profileInput = z.object(withContext).strict();
const historyInput = z.object({
  ...withContext,
  limit: z.number().int().min(1).max(50).default(20),
}).strict();
const careerTemplatesInput = z.object({
  ...withContext,
  roleKey: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const learningResourcesInput = z.object({
  ...withContext,
  roleKey: z.string().trim().min(1).max(120).optional(),
  abilityKey: z.string().trim().min(1).max(120).optional(),
  stage: z.string().trim().min(1).max(120).optional(),
  maxHours: z.number().int().min(1).max(10_000).optional(),
  query: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const simulationStateInput = z.object({
  ...withContext,
  sessionId: z.string().trim().min(1).max(256).optional(),
  scenarioKey: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((input, context) => {
  if (!input.sessionId && !input.scenarioKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sessionId or scenarioKey is required",
      path: ["sessionId"],
    });
  }
});
const candidateInput = z.object({
  ...withContext,
  candidateType: z.enum(AGENT_ARTIFACT_CANDIDATE_TYPES),
  artifact: z.unknown(),
}).strict();
const simulationAppendInput = z.object({
  ...withContext,
  sessionId: z.string().trim().min(1).max(256),
  expectedTurnCount: z.number().int().min(0).max(6),
  userMessage: z.string().trim().min(1).max(4_000),
  assistantMessage: z.string().trim().min(1).max(8_000),
}).strict();

function contextFromClaims(claims: CareerMateContextTokenClaims): CareerMateV2ToolContext {
  return {
    userId: claims.sub,
    sessionId: claims.sid,
    scopes: claims.scopes,
    requestId: claims.jti,
  };
}

function tokenFromRawInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CareerMateV2McpError("INVALID_PARAMS", "输入参数必须是对象", 400);
  }
  const token = (input as Record<string, unknown>).context_token;
  if (typeof token !== "string" || !token.trim()) {
    throw new CareerMateV2McpError("INVALID_PARAMS", "缺少 context_token", 400);
  }
  return token;
}

function verifyContext(
  token: string,
  verifier: (token: string) => CareerMateContextTokenClaims,
): CareerMateV2ToolContext {
  try {
    return contextFromClaims(verifier(token));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Context token expired") {
      throw new CareerMateV2McpError("CONTEXT_TOKEN_EXPIRED", "上下文令牌已过期", 401);
    }
    // Treat every verifier failure as an authentication failure. In particular,
    // never leak verifier implementation details across the MCP boundary.
    throw new CareerMateV2McpError("CONTEXT_TOKEN_INVALID", "上下文令牌无效", 401);
  }
}

function parseInput(schema: z.ZodTypeAny, input: unknown): unknown {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new CareerMateV2McpError("INVALID_PARAMS", "工具输入参数不合法", 400, parsed.error.flatten());
  }
  return parsed.data;
}

function requireScope(context: CareerMateV2ToolContext, scope: CareerMateContextTokenScope) {
  if (!context.scopes.includes(scope)) {
    throw new CareerMateV2McpError("INSUFFICIENT_SCOPE", `缺少权限: ${scope}`, 403);
  }
}

function iso(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function parseField(record: Record<string, unknown>, key: string, fallback: unknown) {
  const value = record[key];
  return typeof value === "string" ? parseJson(value, fallback) : fallback;
}

function mapProfile(profile: Record<string, unknown>) {
  return {
    educationStage: profile.educationStage ?? null,
    major: profile.major ?? null,
    targetRole: profile.targetRole ?? null,
    targetRoleLabel: profile.targetRoleLabel ?? null,
    weeklyAvailableHours: profile.weeklyAvailableHours ?? null,
    learningPreference: parseField(profile, "learningPreference", []),
    experienceSummary: profile.experienceSummary ?? "",
    interestTags: parseField(profile, "interestTags", []),
    constraints: parseField(profile, "constraints", []),
    abilityScores: parseField(profile, "abilityScores", {}),
    memoryEnabled: profile.memoryEnabled ?? false,
    onboardingCompleted: profile.onboardingCompleted ?? false,
    updatedAt: iso(profile.updatedAt),
  };
}

function mapPlanSummary(plan: Record<string, unknown> | null) {
  if (!plan) return null;
  return {
    id: plan.id,
    targetRole: plan.targetRole,
    targetRoleLabel: plan.targetRoleLabel ?? null,
    version: plan.version,
    status: plan.status,
    schemaVersion: plan.schemaVersion,
    currentMonthIndex: plan.currentMonthIndex,
    createdAt: iso(plan.createdAt),
    updatedAt: iso(plan.updatedAt),
  };
}

function publicTranscript(value: unknown) {
  if (typeof value !== "string") return [];
  return parseSimulationTranscript(value).map(({ role, content }) => ({ role, content }));
}

function mapSimulationState(session: Record<string, unknown>) {
  return {
    id: session.id,
    scenarioKey: session.scenarioKey,
    scenarioTitle: session.scenarioTitle,
    transcript: publicTranscript(session.transcript),
    score: session.score ?? null,
    feedback: parseField(session, "feedback", {}),
    status: session.status,
    turnCount: session.turnCount,
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
  };
}

function mapSimulationSummary(session: Record<string, unknown>) {
  return {
    id: session.id,
    scenarioKey: session.scenarioKey,
    scenarioTitle: session.scenarioTitle,
    score: session.score ?? null,
    feedback: parseField(session, "feedback", {}),
    status: session.status,
    turnCount: session.turnCount,
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
  };
}

const roleTemplateJsonFields = [
  "targetAudience",
  "entryRequirements",
  "coreWork",
  "abilityWeights",
  "threeYearPath",
  "monthlyTemplates",
  "practiceProjects",
  "recommendedResources",
  "simulationScenarios",
  "evaluationRules",
  "sources",
  "aliases",
] as const;

function mapRoleTemplate(template: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {
    ...template,
    createdAt: iso(template.createdAt),
    updatedAt: iso(template.updatedAt),
  };
  for (const key of roleTemplateJsonFields) {
    mapped[key] = parseField(template, key, key === "abilityWeights" ? {} : []);
  }
  return mapped;
}

function deriveIdempotencyKey(
  context: CareerMateV2ToolContext,
  candidateType: string,
): string {
  return createHash("sha256")
    .update(`${context.requestId}\n${candidateType}`)
    .digest("hex");
}

function mapCandidateError(error: unknown): never {
  if (error instanceof AgentArtifactCandidateError || (
    error instanceof Error && "code" in error && "status" in error
  )) {
    const candidateError = error as Error & { code: string; status: number; detail?: unknown };
    if (candidateError.code === "CONVERSATION_NOT_FOUND") {
      throw new CareerMateV2McpError(
        "CONTEXT_SESSION_NOT_FOUND",
        "令牌会话不属于当前用户或已不存在",
        403,
      );
    }
    const publicFailures: Record<string, { code: string; message: string; status: number }> = {
      CANDIDATE_TYPE_NOT_ALLOWED: {
        code: "CANDIDATE_TYPE_NOT_ALLOWED",
        message: "候选类型不受支持",
        status: 400,
      },
      INVALID_ARTIFACT: {
        code: "CANDIDATE_INVALID_ARTIFACT",
        message: "候选内容不符合 V2 结构协议",
        status: 400,
      },
      ARTIFACT_NOT_PENDING: {
        code: "CANDIDATE_NOT_PENDING",
        message: "只有待确认结果可以保存为候选",
        status: 400,
      },
      CONFIRMATION_REQUIRED: {
        code: "CANDIDATE_CONFIRMATION_REQUIRED",
        message: "候选必须明确要求用户确认",
        status: 400,
      },
      INVALID_CONTEXT: {
        code: "CANDIDATE_INVALID_CONTEXT",
        message: "候选来源上下文无效",
        status: 400,
      },
      TASK_TYPE_MISMATCH: {
        code: "CANDIDATE_TASK_TYPE_MISMATCH",
        message: "候选类型与任务类型不匹配",
        status: 400,
      },
      BASE_VERSION_REQUIRED: {
        code: "CANDIDATE_BASE_VERSION_REQUIRED",
        message: "该候选缺少正式数据基础版本",
        status: 400,
      },
      IDEMPOTENCY_CONFLICT: {
        code: "CANDIDATE_IDEMPOTENCY_CONFLICT",
        message: "同一请求已生成不同内容的该类候选",
        status: 409,
      },
    };
    const publicFailure = publicFailures[candidateError.code];
    if (publicFailure) {
      throw new CareerMateV2McpError(
        publicFailure.code,
        publicFailure.message,
        publicFailure.status,
      );
    }
  }
  throw error;
}

export function createCareerMateV2ToolRegistry(
  dependencies: CareerMateV2RegistryDependencies = {},
) {
  const db = dependencies.db ?? (getPrisma() as unknown as V2Database);
  const verifyToken = dependencies.verifyToken ?? verifyCareerMateContextToken;
  const candidateService = dependencies.candidateService
    ?? createAgentArtifactCandidateService();
  const tools = new Map<CareerMateV2ToolName, V2ToolDefinition>();

  const register = (tool: V2ToolDefinition) => tools.set(tool.name, tool);

  register({
    name: "profile.read",
    description: "读取令牌用户已确认的职业画像、画像版本和已确认能力证据。不会读取其他用户或未确认能力证据。",
    requiredScope: "profile:read",
    inputSchema: profileInput,
    inputJsonSchema: objectJsonSchema({}),
    async handler(_rawInput, context) {
      const profile = await db.userProfile.findUnique({
        where: { userId: context.userId },
        select: {
          version: true,
          educationStage: true,
          major: true,
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
          updatedAt: true,
        },
      });
      if (!profile) throw new CareerMateV2McpError("PROFILE_NOT_FOUND", "用户画像不存在", 404);
      const abilityEvidence = await db.abilityEvidence.findMany({
        where: { userId: context.userId, status: "confirmed" },
        select: {
          id: true,
          abilityKey: true,
          summary: true,
          sourceType: true,
          sourceRef: true,
          confidence: true,
          status: true,
          observedAt: true,
        },
        orderBy: { observedAt: "desc" },
        take: 100,
      });
      return {
        version: profile.version,
        profile: mapProfile(profile),
        abilityEvidence: abilityEvidence.map((evidence) => ({
          ...evidence,
          observedAt: iso(evidence.observedAt),
        })),
      };
    },
  });

  register({
    name: "growth_history.read",
    description: "读取令牌用户的当前/历史计划摘要、进度日志和训练摘要，结果数量受限。",
    requiredScope: "history:read",
    inputSchema: historyInput,
    inputJsonSchema: objectJsonSchema({
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    }),
    async handler(rawInput, context) {
      const input = historyInput.parse(rawInput);
      const planSummarySelect = {
        id: true,
        targetRole: true,
        targetRoleLabel: true,
        version: true,
        status: true,
        schemaVersion: true,
        currentMonthIndex: true,
        createdAt: true,
        updatedAt: true,
      };
      const [currentPlan, planHistory, progressLogs, simulations] = await Promise.all([
        db.careerPlan.findFirst({
          where: { userId: context.userId, status: "active" },
          orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
          select: planSummarySelect,
        }),
        db.careerPlan.findMany({
          where: { userId: context.userId },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: planSummarySelect,
        }),
        db.progressLog.findMany({
          where: { userId: context.userId },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            eventType: true,
            title: true,
            summary: true,
            relatedPlanId: true,
            relatedTaskId: true,
            createdAt: true,
          },
        }),
        db.simulationSession.findMany({
          where: { userId: context.userId },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            scenarioKey: true,
            scenarioTitle: true,
            score: true,
            feedback: true,
            status: true,
            turnCount: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);
      return {
        currentPlan: mapPlanSummary(currentPlan),
        planHistory: planHistory.map(mapPlanSummary),
        progressLogs: progressLogs.map((log) => ({
          id: log.id,
          eventType: log.eventType,
          title: log.title,
          summary: log.summary,
          relatedPlanId: log.relatedPlanId ?? null,
          relatedTaskId: log.relatedTaskId ?? null,
          createdAt: iso(log.createdAt),
        })),
        simulations: simulations.map(mapSimulationSummary),
      };
    },
  });

  register({
    name: "career_templates.query",
    description: "查询 CareerMate 正式发布的职业模板；未知职业只能形成候选，不能由此工具发布。",
    requiredScope: "resources:read",
    inputSchema: careerTemplatesInput,
    inputJsonSchema: objectJsonSchema({
      roleKey: { type: "string" },
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
    }),
    async handler(rawInput) {
      const input = careerTemplatesInput.parse(rawInput);
      const rows = await db.roleTemplate.findMany({
        where: {
          ...(input.roleKey ? { roleKey: input.roleKey } : {}),
          ...(input.query ? {
            OR: [
              { roleName: { contains: input.query } },
              { category: { contains: input.query } },
              { aliases: { contains: input.query } },
            ],
          } : {}),
        },
        take: input.limit,
        orderBy: { roleName: "asc" },
      });
      return rows.map(mapRoleTemplate);
    },
  });

  register({
    name: "learning_resources.query",
    description: "按职业、能力、阶段、时间预算或关键词查询 CareerMate 学习资源。",
    requiredScope: "resources:read",
    inputSchema: learningResourcesInput,
    inputJsonSchema: objectJsonSchema({
      roleKey: { type: "string" },
      abilityKey: { type: "string" },
      stage: { type: "string" },
      maxHours: { type: "integer", minimum: 1 },
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
    }),
    async handler(rawInput) {
      const input = learningResourcesInput.parse(rawInput);
      return db.resourceItem.findMany({
        where: {
          ...(input.roleKey ? { roleKey: input.roleKey } : {}),
          ...(input.abilityKey ? { abilityKey: input.abilityKey } : {}),
          ...(input.stage ? { stage: input.stage } : {}),
          ...(input.maxHours ? { estimatedHours: { lte: input.maxHours } } : {}),
          ...(input.query ? {
            OR: [
              { title: { contains: input.query } },
              { description: { contains: input.query } },
              { source: { contains: input.query } },
            ],
          } : {}),
        },
        take: input.limit,
        orderBy: { title: "asc" },
      });
    },
  });

  register({
    name: "simulation_state.read",
    description: "按训练会话或场景读取令牌用户自己的模拟状态、轮次、转录和反馈。",
    requiredScope: "history:read",
    inputSchema: simulationStateInput,
    inputJsonSchema: objectJsonSchema({
      sessionId: { type: "string" },
      scenarioKey: { type: "string" },
    }),
    async handler(rawInput, context) {
      const input = simulationStateInput.parse(rawInput);
      const session = await db.simulationSession.findFirst({
        where: {
          ...(input.sessionId ? { id: input.sessionId } : { scenarioKey: input.scenarioKey }),
          userId: context.userId,
        },
        orderBy: input.sessionId ? undefined : { updatedAt: "desc" },
        select: {
          id: true,
          scenarioKey: true,
          scenarioTitle: true,
          transcript: true,
          score: true,
          feedback: true,
          status: true,
          turnCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!session) {
        throw new CareerMateV2McpError("SIMULATION_NOT_FOUND", "训练会话不存在", 404);
      }
      return mapSimulationState(session);
    },
  });

  register({
    name: "candidate.create",
    description: "保存等待用户确认的 V2 结构化候选；不会修改正式画像、证据、计划、进度或记忆。",
    requiredScope: "candidates:create",
    inputSchema: candidateInput,
    inputJsonSchema: objectJsonSchema({
      candidateType: { type: "string", enum: [...AGENT_ARTIFACT_CANDIDATE_TYPES] },
      artifact: { type: "object" },
    }, ["candidateType", "artifact"]),
    async handler(rawInput, context) {
      const input = candidateInput.parse(rawInput);
      try {
        return await candidateService.createCandidate({
          userId: context.userId,
          candidateType: input.candidateType,
          artifact: input.artifact,
          context: {
            sessionId: context.sessionId,
            conversationId: context.sessionId,
            idempotencyKey: deriveIdempotencyKey(
              context,
              input.candidateType,
            ),
          },
        });
      } catch (error) {
        return mapCandidateError(error);
      }
    },
  });

  register({
    name: "simulation_turn.append",
    description: "原子追加当前用户实际发生的一轮训练问答；不创建成长进度或修改能力分数。",
    requiredScope: "simulation:append",
    inputSchema: simulationAppendInput,
    inputJsonSchema: objectJsonSchema({
      sessionId: { type: "string" },
      expectedTurnCount: { type: "integer", minimum: 0, maximum: 6 },
      userMessage: { type: "string" },
      assistantMessage: { type: "string" },
    }, ["sessionId", "expectedTurnCount", "userMessage", "assistantMessage"]),
    async handler(rawInput, context) {
      const input = simulationAppendInput.parse(rawInput);
      const operationId = `simulation_turn.append:${input.sessionId}`;
      const ledgerIdentity = {
        userId: context.userId,
        conversationId: context.sessionId,
        clientRequestId: context.requestId,
        operationId,
      };
      try {
        return await db.$transaction(async (transaction) => {
          const execution = await transaction.operationExecution.create({
            data: {
              ...ledgerIdentity,
              opType: "simulation_turn.append",
              status: "pending",
              result: "{}",
            },
            select: { id: true },
          });
          const session = await transaction.simulationSession.findFirst({
            where: { id: input.sessionId, userId: context.userId },
            select: {
              id: true,
              scenarioKey: true,
              scenarioTitle: true,
              transcript: true,
              score: true,
              feedback: true,
              status: true,
              turnCount: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          if (!session) {
            throw new CareerMateV2McpError("SIMULATION_NOT_FOUND", "训练会话不存在", 404);
          }
          if (session.status !== "active") {
            throw new CareerMateV2McpError("SIMULATION_NOT_ACTIVE", "训练会话已经结束", 409);
          }
          const currentTurnCount = Number(session.turnCount);
          if (currentTurnCount >= 6) {
            throw new CareerMateV2McpError("SIMULATION_MAX_TURNS", "训练已达到最多 6 轮", 409);
          }
          if (currentTurnCount !== input.expectedTurnCount) {
            throw new CareerMateV2McpError(
              "SIMULATION_TURN_CONFLICT",
              "训练轮次已变化，请重新读取状态后重试",
              409,
            );
          }
          const transcript = typeof session.transcript === "string"
            ? parseSimulationTranscript(session.transcript)
            : [];
          const nextTranscript = [
            ...transcript,
            { role: "user" as const, content: input.userMessage },
            {
              role: "assistant" as const,
              content: input.assistantMessage,
              meta: {
                requestedMode: "api" as const,
                actualMode: "api" as const,
                degraded: false,
                fallbackReason: null,
                source: "tbox-agentic-v2",
              },
            },
          ];
          const winner = await transaction.simulationSession.updateMany({
            where: {
              id: input.sessionId,
              userId: context.userId,
              status: "active",
              turnCount: input.expectedTurnCount,
            },
            data: {
              transcript: JSON.stringify(nextTranscript),
              turnCount: currentTurnCount + 1,
            },
          });
          if (winner.count !== 1) {
            throw new CareerMateV2McpError(
              "SIMULATION_TURN_CONFLICT",
              "训练会话发生并发更新，请重新读取状态后重试",
              409,
            );
          }
          const persisted = await transaction.simulationSession.findUnique({
            where: { id: input.sessionId },
            select: {
              id: true,
              scenarioKey: true,
              scenarioTitle: true,
              transcript: true,
              score: true,
              feedback: true,
              status: true,
              turnCount: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          if (!persisted) {
            throw new CareerMateV2McpError("SIMULATION_NOT_FOUND", "训练会话不存在", 404);
          }
          const result = mapSimulationState(persisted);
          await transaction.operationExecution.update({
            where: { id: execution.id },
            data: { status: "completed", result: JSON.stringify(result) },
          });
          return result;
        });
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
          throw error;
        }
        const existing = await db.operationExecution.findUnique({
          where: {
            userId_conversationId_clientRequestId_operationId: ledgerIdentity,
          },
          select: { status: true, result: true },
        });
        if (!existing) throw error;
        if (existing.status === "pending") {
          throw new CareerMateV2McpError(
            "SIMULATION_APPEND_IN_PROGRESS",
            "该训练轮次正在保存，请稍后重试",
            409,
          );
        }
        if (existing.status === "failed") {
          throw new CareerMateV2McpError(
            "SIMULATION_APPEND_FAILED",
            "该训练轮次保存失败，请使用新的请求重试",
            500,
          );
        }
        if (existing.status !== "completed" || typeof existing.result !== "string") throw error;
        const replay = parseJson<unknown>(existing.result, null);
        if (!replay || typeof replay !== "object" || Array.isArray(replay)) throw error;
        return replay;
      }
    },
  });

  return {
    listForMcp() {
      return CAREERMATE_V2_TOOL_NAMES.map((name) => {
        const tool = tools.get(name)!;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputJsonSchema,
        };
      });
    },

    async call(name: string, input: unknown) {
      const tool = tools.get(name as CareerMateV2ToolName);
      if (!tool) {
        throw new CareerMateV2McpError("TOOL_NOT_FOUND", `未知 V2 工具: ${name}`, 404);
      }
      try {
        const token = tokenFromRawInput(input);
        const context = verifyContext(token, verifyToken);
        requireScope(context, tool.requiredScope);
        const parsed = parseInput(tool.inputSchema, input);
        return await tool.handler(parsed, context);
      } catch (error) {
        if (error instanceof CareerMateV2McpError) throw error;
        const internalCode = error && typeof error === "object" && "code" in error
          ? String(error.code)
          : undefined;
        console.error("CareerMate V2 MCP tool failed", {
          tool: tool.name,
          errorName: error instanceof Error ? error.name : typeof error,
          ...(internalCode ? { internalCode } : {}),
        });
        throw new CareerMateV2McpError(
          "INTERNAL_ERROR",
          "CareerMate 业务工具暂时不可用",
          500,
        );
      }
    },
  };
}
