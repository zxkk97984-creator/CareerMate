# CareerMate Agentic V2 No-Business-MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local CareerMate application use the TBox Agentic V2 application as its single AI brain without depending on `CareerMate业务MCP V2`, while safely supplying confirmed user context, parsing structured artifacts from the real TBox text stream, persisting confirmation candidates, and preserving simulation continuity.

**Architecture:** CareerMate continues to own authentication, authoritative data, versioning, confirmation, and official writes. The server sends a bounded, sanitized `business_data` snapshot to the single TBox `agent_id`; TBox acquires stable career knowledge and live market evidence through its own knowledge bases and Quark search. Candidate-producing responses use one explicit tagged JSON envelope inside the normal text response because the real TBox completed event does not expose a `structured` field.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, React 19, Prisma 6/SQLite, Zod 3, Vitest 3, TBox SSE API.

---

## Scope and non-negotiable boundaries

- Work only in `C:\Users\zxk\Documents\AI职业规划\CareerMate\.worktrees\careermate-agentic-v2`.
- Do not modify, upgrade, publish, or delete any resource in the TBox website.
- Preserve the user's current uncommitted platform work:
  - `src/agentic-v2/platform/prompts/researcher.md`
  - `src/agentic-v2/platform/automation/`
  - `src/agentic-v2/platform/prompts/researcher-prompt.md`
  - `src/agentic-v2/platform/prompts/workflow-profile.md`
  - `CAREERMATE_TBOX_AGENTIC_V2_ARCHITECTURE_HANDOFF.md`
- Do not delete `/api/mcp/v2`, `careermate-v2-registry.ts`, or context-token code. They may remain as dormant future infrastructure, but the active Agentic V2 chat path must not require them.
- Keep `search_engine` disabled for Agentic V2 requests. TBox performs web research only through the already mounted Quark MCP.
- Never infer an official write from arbitrary Markdown or an untagged JSON block.
- If artifact parsing or validation fails, keep the readable answer, add a warning, and perform no candidate or official-data mutation.
- Existing legacy chat behavior must continue working when `AGENTIC_V2_ENABLED` is false.

## Current defects this plan fixes

1. `src/lib/chat/agentic-v2-context.ts` sends only `careermate_context_token`; the configured V2 Agent has no active CareerMate business MCP, so it cannot see the user's confirmed profile or history.
2. `src/lib/tbox/types.ts` correctly documents that the real TBox API does not return a terminal `structured` field, while `parseTerminalAgentResponse` still depends on that field.
3. `AgentArtifactCandidate` and `candidate-service.ts` exist, but normal chat responses never create these candidates.
4. Chat message parts do not contain a generic Agentic V2 candidate reference.
5. Simulation routes still rely on the old structured-response path.

## File responsibility map

### Create

- `src/lib/agentic-v2/artifact-envelope.ts` — exact tagged-envelope extraction and validation.
- `src/lib/agentic-v2/artifact-envelope.test.ts` — parser security and compatibility tests.
- `src/lib/agentic-v2/candidate-ingestion.ts` — map validated artifacts to candidate types and create idempotent candidates.
- `src/lib/agentic-v2/candidate-ingestion.test.ts` — task/candidate mapping and no-side-effect tests.
- `src/lib/chat/agentic-v2-snapshot.ts` — load and sanitize confirmed CareerMate data for `business_data`.
- `src/lib/chat/agentic-v2-snapshot.test.ts` — ownership, privacy, truncation, and byte-budget tests.
- `src/app/api/agentic-v2/candidates/[candidateId]/route.ts` — authenticated candidate detail endpoint.
- `src/app/api/agentic-v2/candidates/[candidateId]/route.test.ts` — candidate ownership tests.
- `src/app/api/agentic-v2/candidates/[candidateId]/decision/route.ts` — authenticated accept/reject endpoint.
- `src/app/api/agentic-v2/candidates/[candidateId]/decision/route.test.ts` — confirmation, conflict, and idempotency tests.
- `src/lib/agentic-v2/candidate-resolution.ts` — version-checked candidate resolution and official-write adapters.
- `src/lib/agentic-v2/candidate-resolution.test.ts` — per-candidate resolution tests.
- `src/components/chat/agent-artifact-candidate-card.tsx` — generic confirmation card.
- `src/components/chat/agent-artifact-candidate-card.test.tsx` — rendering and decision tests.

### Modify

- `src/lib/agentic-v2/contracts.ts` — replace token-only business data with bounded snapshots.
- `src/lib/agentic-v2/contracts.test.ts` — assert the new data contract.
- `src/lib/chat/agentic-v2-context.ts` — build business data from supplied snapshots, not a token.
- `src/lib/chat/agentic-v2-context.test.ts` — remove token assumptions and test strict parsing.
- `src/lib/chat/stream-service.ts` — load snapshots, parse the text envelope, persist candidates, and strip the envelope from visible text.
- `src/lib/chat/stream-service-stateful.test.ts` — verify snapshot transport and candidate creation.
- `src/lib/chat/stream-service.test.ts` — preserve legacy behavior.
- `src/lib/chat/persistence.ts` — add `agent_artifact_candidate_ref`.
- `src/lib/chat/persistence.test.ts` — validate and reject malformed refs.
- `src/lib/chat/artifacts.ts` — add the generic candidate-ref constructor.
- `src/components/chat/message-parts.tsx` — render the generic candidate card.
- `src/components/chat/chat-home.tsx` — count the new pending candidate part.
- `src/lib/simulation/generation.ts` — use the same exact envelope protocol for V2 turns and reports.
- `src/lib/simulation/generation.test.ts` — real-text protocol tests.
- `src/app/api/simulations/[sessionId]/messages/route.ts` — consume validated V2 simulation artifacts.
- `src/app/api/simulations/[sessionId]/messages/route.test.ts` — continuity and duplicate-question tests.
- `src/app/api/simulations/[sessionId]/complete/route.ts` — consume validated reports and create evidence candidates.
- `src/app/api/simulations/[sessionId]/complete/route.test.ts` — report and candidate tests.
- `src/agentic-v2/platform/prompts/main.md` — document the exact envelope contract for the human who updates TBox.
- `AGENTIC_V2_HANDOFF.md` — describe the no-business-MCP runtime.
- `.env.example` — mark business-MCP token settings as optional/dormant instead of required.

## Task 1: Replace the active token-only `business_data` contract

**Files:**
- Modify: `src/lib/agentic-v2/contracts.ts`
- Modify: `src/lib/agentic-v2/contracts.test.ts`
- Modify: `src/lib/chat/agentic-v2-context.ts`
- Modify: `src/lib/chat/agentic-v2-context.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests that parse the following object and assert that `careermate_context_token` is rejected:

```ts
const businessData = {
  schemaVersion: "1",
  interaction: {
    surface: "career_path",
    action: "regenerate_plan",
    targetRef: "plan-1",
  },
  profileSnapshot: {
    available: true,
    version: 5,
    data: {
      targetRole: "data_analyst",
      weeklyAvailableHours: 8,
      abilityScores: { dataAnalysis: 62 },
      abilityEvidence: [],
    },
  },
  historySnapshot: {
    available: true,
    through: "2026-07-23T08:00:00.000Z",
    data: {
      activePlan: { id: "plan-1", version: 3, targetRole: "data_analyst" },
      recentProgress: [],
      recentSimulations: [],
      confirmedMemories: [],
      conversationSummary: "",
    },
  },
  simulationState: null,
  permissions: {
    candidateCreationAllowed: true,
    officialWritesAllowed: false,
  },
};

expect(businessDataV1Schema.parse(businessData)).toEqual(businessData);
expect(businessDataV1Schema.safeParse({
  ...businessData,
  careermate_context_token: "must-not-be-active",
}).success).toBe(false);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/contracts.test.ts src/lib/chat/agentic-v2-context.test.ts
```

Expected: FAIL because the current schema requires `careermate_context_token`.

- [ ] **Step 3: Define the strict snapshot schemas**

Replace `businessDataV1Schema` with strict schemas that require the two snapshot containers, a nullable simulation state, and explicit permissions:

```ts
const profileSnapshotV1Schema = z.object({
  available: z.boolean(),
  version: z.number().int().nonnegative().nullable(),
  data: serializableJsonValueSchema,
}).strict();

const historySnapshotV1Schema = z.object({
  available: z.boolean(),
  through: z.string().datetime({ offset: true }).nullable(),
  data: serializableJsonValueSchema,
}).strict();

const simulationStateV1Schema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  scenarioKey: z.string().trim().min(1).max(160),
  status: z.string().trim().min(1).max(80),
  round: z.number().int().nonnegative(),
  transcript: z.array(serializableJsonValueSchema).max(12),
}).strict();

export const businessDataV1Schema = z.object({
  schemaVersion: z.literal("1"),
  interaction: interactionV1Schema.optional(),
  profileSnapshot: profileSnapshotV1Schema,
  historySnapshot: historySnapshotV1Schema,
  simulationState: simulationStateV1Schema.nullable(),
  permissions: z.object({
    candidateCreationAllowed: z.literal(true),
    officialWritesAllowed: z.literal(false),
  }).strict(),
}).strict();
```

Export the inferred snapshot types so the snapshot loader and context builder use one source of truth.

- [ ] **Step 4: Make the context builder a pure validator**

Remove signing imports from `agentic-v2-context.ts`. Accept already-sanitized snapshots and return `businessDataV1Schema.parse(...)`:

```ts
export interface BuildAgenticV2BusinessDataInput {
  interaction?: AgenticV2Interaction;
  profileSnapshot: BusinessDataV1["profileSnapshot"];
  historySnapshot: BusinessDataV1["historySnapshot"];
  simulationState: BusinessDataV1["simulationState"];
}

export function buildAgenticV2BusinessData(
  input: BuildAgenticV2BusinessDataInput,
): BusinessDataV1 {
  return businessDataV1Schema.parse({
    schemaVersion: "1",
    interaction: input.interaction ?? DEFAULT_INTERACTION,
    profileSnapshot: input.profileSnapshot,
    historySnapshot: input.historySnapshot,
    simulationState: input.simulationState,
    permissions: {
      candidateCreationAllowed: true,
      officialWritesAllowed: false,
    },
  });
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/contracts.test.ts src/lib/chat/agentic-v2-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit only the Task 1 files**

```bash
git add src/lib/agentic-v2/contracts.ts src/lib/agentic-v2/contracts.test.ts src/lib/chat/agentic-v2-context.ts src/lib/chat/agentic-v2-context.test.ts
git commit -m "refactor: send snapshots to agentic v2"
```

## Task 2: Build a bounded and privacy-safe CareerMate snapshot

**Files:**
- Create: `src/lib/chat/agentic-v2-snapshot.ts`
- Create: `src/lib/chat/agentic-v2-snapshot.test.ts`

- [ ] **Step 1: Write failing loader tests**

Cover all of these behaviors with an injected fake database:

```ts
it("includes only confirmed ability evidence and normal confirmed memories", async () => {
  const result = await loadAgenticV2Snapshot({
    userId: "user-1",
    conversationId: "conv-1",
    interaction: { surface: "chat", action: "message_submit" },
  }, { db: fakeDb });

  expect(JSON.stringify(result)).toContain("confirmed evidence");
  expect(JSON.stringify(result)).not.toContain("pending evidence");
  expect(JSON.stringify(result)).not.toContain("sensitive memory");
});

it("does not expose identity or authentication fields", async () => {
  const serialized = JSON.stringify(await loadAgenticV2Snapshot(input, { db: fakeDb }));
  for (const forbidden of ["email", "password", "passwordHash", "tokenHash", "phone", "realName"]) {
    expect(serialized).not.toContain(forbidden);
  }
});

it("loads a simulation only when targetRef belongs to the authenticated user", async () => {
  const result = await loadAgenticV2Snapshot({
    ...input,
    interaction: { surface: "simulation", action: "continue", targetRef: "session-1" },
  }, { db: fakeDb });
  expect(result.simulationState?.sessionId).toBe("session-1");
  expect(fakeDb.simulationSession.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "session-1", userId: "user-1" } }),
  );
});

it("keeps serialized business_data under 49152 bytes", async () => {
  const result = await loadAgenticV2Snapshot(input, { db: oversizedFakeDb });
  expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(49_152);
});
```

- [ ] **Step 2: Run the new test and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/chat/agentic-v2-snapshot.test.ts
```

Expected: FAIL because `loadAgenticV2Snapshot` does not exist.

- [ ] **Step 3: Implement focused database loading**

Create one exported entry point:

```ts
export interface LoadAgenticV2SnapshotInput {
  userId: string;
  conversationId: string;
  interaction?: AgenticV2Interaction;
}

export async function loadAgenticV2Snapshot(
  input: LoadAgenticV2SnapshotInput,
  dependencies: { db?: SnapshotDatabase; now?: () => Date } = {},
): Promise<Pick<BusinessDataV1, "profileSnapshot" | "historySnapshot" | "simulationState">>
```

The loader must make bounded queries:

- `UserProfile`: one row by `userId`.
- `AbilityEvidence`: `status: "confirmed"`, newest first, maximum 20.
- `CareerPlan`: newest `status: "active"`, one row.
- `ProgressLog`: newest first, maximum 20.
- `SimulationSession`: newest completed sessions, maximum 5; never include more than the latest 12 transcript items per session.
- `MemoryItem`: only `status: "confirmed"`, `scope: "career"`, `sensitivity: "normal"`, non-expired, maximum 10, and only when `memoryEnabled` is true.
- `ChatConversation`: by both `id` and `userId`, selecting only `summary` and `contextVersion`.
- Target simulation: by both `interaction.targetRef` and `userId`.

Use small helpers with fixed limits:

```ts
const LIMITS = {
  evidence: 20,
  progress: 20,
  simulations: 5,
  transcriptItems: 12,
  memories: 10,
  text: 1_500,
  bytes: 49_152,
} as const;

function truncateText(value: unknown, max = LIMITS.text): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
```

Do not select the `User` row and do not serialize raw database records. Construct explicit DTOs field by field.

- [ ] **Step 4: Enforce the total byte budget**

After constructing the DTO, compute the UTF-8 size. If it exceeds 49,152 bytes, reduce data in this order:

1. simulation transcript items from 12 to 6;
2. recent progress from 20 to 10;
3. ability evidence from 20 to 10;
4. confirmed memories from 10 to 5;
5. free-text fields from 1,500 to 600 characters.

If the result still exceeds the budget, throw a typed `AgenticV2SnapshotError("SNAPSHOT_TOO_LARGE")`; never silently send an oversized payload.

- [ ] **Step 5: Run snapshot tests**

Run:

```bash
npx.cmd vitest run src/lib/chat/agentic-v2-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/chat/agentic-v2-snapshot.ts src/lib/chat/agentic-v2-snapshot.test.ts
git commit -m "feat: build sanitized agentic v2 snapshots"
```

## Task 3: Send the sanitized snapshot through both chat paths

**Files:**
- Modify: `src/lib/chat/stream-service.ts`
- Modify: `src/lib/chat/stream-service-stateful.test.ts`
- Modify: `src/lib/chat/stream-service.test.ts`

- [ ] **Step 1: Add failing stateful-stream tests**

Test that Agentic V2 passes the snapshot to TBox and does not pass a context token:

```ts
expect(mocks.streamChatWithTboxProgressive).toHaveBeenCalledWith(
  expect.objectContaining({
    question: "请根据我的最新进度调整计划",
    history: undefined,
    searchPolicy: "off",
    context: expect.objectContaining({
      schemaVersion: "1",
      profileSnapshot: expect.objectContaining({ available: true }),
      historySnapshot: expect.objectContaining({ available: true }),
      permissions: {
        candidateCreationAllowed: true,
        officialWritesAllowed: false,
      },
    }),
  }),
  expect.anything(),
  expect.any(Function),
);

expect(JSON.stringify(mocks.streamChatWithTboxProgressive.mock.calls[0])).not.toContain(
  "careermate_context_token",
);
```

Also test that a snapshot-loader failure fails the turn safely rather than falling back to sending empty or cross-user data.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/chat/stream-service-stateful.test.ts src/lib/chat/stream-service.test.ts
```

Expected: FAIL because `stream-service.ts` still builds a context token.

- [ ] **Step 3: Load the snapshot once before streaming**

Import `loadAgenticV2Snapshot`. In the stateful path, load it alongside the existing profile/history reads and pass it to `buildAgenticV2BusinessData`.

Do not add more database code to `stream-service.ts`. The only new stream-service logic should resemble:

```ts
const agenticSnapshot = agenticV2
  ? await loadAgenticV2Snapshot({
      userId,
      conversationId,
      interaction: options.interaction,
    })
  : null;

const v2BusinessData = agenticSnapshot
  ? buildAgenticV2BusinessData({
      interaction: options.interaction,
      ...agenticSnapshot,
    })
  : undefined;
```

Reuse `v2BusinessData` inside the stream callback. Do not re-query or rebuild it during retries.

- [ ] **Step 4: Update the legacy transport path**

When Agentic V2 is enabled but stateful turns are disabled, load the same snapshot after authenticating the local conversation. Do not send a minimal token-only context.

- [ ] **Step 5: Preserve routing semantics**

Assert and retain:

```ts
question = message;
history = undefined;
searchPolicy = "off";
conversationId = existingRemoteId;
```

The frontend describes `interaction`; it never chooses a TBox workflow.

- [ ] **Step 6: Run chat tests**

Run:

```bash
npx.cmd vitest run src/lib/chat/stream-service-stateful.test.ts src/lib/chat/stream-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/chat/stream-service.ts src/lib/chat/stream-service-stateful.test.ts src/lib/chat/stream-service.test.ts
git commit -m "feat: deliver career context to agentic v2"
```

## Task 4: Parse one exact artifact envelope from the real text stream

**Files:**
- Create: `src/lib/agentic-v2/artifact-envelope.ts`
- Create: `src/lib/agentic-v2/artifact-envelope.test.ts`

- [ ] **Step 1: Write parser tests**

Use these exact protocol tags:

```ts
export const ARTIFACT_OPEN_TAG = "<CAREERMATE_ARTIFACT>";
export const ARTIFACT_CLOSE_TAG = "</CAREERMATE_ARTIFACT>";
```

Required cases:

```ts
it("extracts one valid artifact and removes the envelope from visible text", () => {
  const result = parseAgentArtifactEnvelope(
    `这是给用户看的答案。\n<CAREERMATE_ARTIFACT>\n${JSON.stringify(validArtifact)}\n</CAREERMATE_ARTIFACT>`,
  );
  expect(result.displayText).toBe("这是给用户看的答案。");
  expect(result.artifact).toEqual(validArtifact);
  expect(result.warnings).toEqual([]);
});

it("does not parse an untagged JSON or markdown code block", () => {
  for (const text of [
    JSON.stringify(validArtifact),
    `\`\`\`json\n${JSON.stringify(validArtifact)}\n\`\`\``,
  ]) {
    const result = parseAgentArtifactEnvelope(text);
    expect(result.artifact).toBeUndefined();
  }
});

it("rejects multiple envelopes", () => {
  const block = `<CAREERMATE_ARTIFACT>${JSON.stringify(validArtifact)}</CAREERMATE_ARTIFACT>`;
  const result = parseAgentArtifactEnvelope(`${block}\n${block}`);
  expect(result.artifact).toBeUndefined();
  expect(result.warnings).toContain("MULTIPLE_ARTIFACT_ENVELOPES");
});

it("keeps readable text and performs no artifact action for invalid JSON or schema", () => {
  const result = parseAgentArtifactEnvelope(
    "可读答案\n<CAREERMATE_ARTIFACT>{bad json}</CAREERMATE_ARTIFACT>",
  );
  expect(result.displayText).toBe("可读答案");
  expect(result.artifact).toBeUndefined();
  expect(result.warnings).toContain("INVALID_ARTIFACT_ENVELOPE");
});
```

Also test nested tags, missing close tag, empty visible text, and an envelope larger than 65,536 bytes.

- [ ] **Step 2: Run the new test and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/artifact-envelope.test.ts
```

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement exact extraction**

Implement one scan only. Do not reuse `extractJsonFromText`, a broad regular expression, or the old Markdown parser:

```ts
export interface ParsedAgentArtifactEnvelope {
  displayText: string;
  artifact?: AgentArtifactV1;
  warnings: string[];
}

export function parseAgentArtifactEnvelope(text: string): ParsedAgentArtifactEnvelope {
  const open = text.indexOf(ARTIFACT_OPEN_TAG);
  if (open < 0) return { displayText: text, warnings: [] };

  const secondOpen = text.indexOf(ARTIFACT_OPEN_TAG, open + ARTIFACT_OPEN_TAG.length);
  const close = text.indexOf(ARTIFACT_CLOSE_TAG, open + ARTIFACT_OPEN_TAG.length);
  const secondClose = close < 0
    ? -1
    : text.indexOf(ARTIFACT_CLOSE_TAG, close + ARTIFACT_CLOSE_TAG.length);

  if (secondOpen >= 0 || secondClose >= 0) {
    return { displayText: text, warnings: ["MULTIPLE_ARTIFACT_ENVELOPES"] };
  }
  if (close < 0) {
    return { displayText: text, warnings: ["INVALID_ARTIFACT_ENVELOPE"] };
  }

  const raw = text.slice(open + ARTIFACT_OPEN_TAG.length, close).trim();
  const displayText = `${text.slice(0, open)}${text.slice(close + ARTIFACT_CLOSE_TAG.length)}`.trim();
  if (Buffer.byteLength(raw, "utf8") > 65_536) {
    return { displayText, warnings: ["ARTIFACT_ENVELOPE_TOO_LARGE"] };
  }

  try {
    const parsed = agentArtifactV1Schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { displayText, warnings: ["INVALID_ARTIFACT_SCHEMA"] };
    }
    return { displayText, artifact: parsed.data, warnings: [] };
  } catch {
    return { displayText, warnings: ["INVALID_ARTIFACT_ENVELOPE"] };
  }
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/artifact-envelope.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/lib/agentic-v2/artifact-envelope.ts src/lib/agentic-v2/artifact-envelope.test.ts
git commit -m "feat: parse exact agent artifact envelopes"
```

## Task 5: Ingest only validated pending-confirmation artifacts

**Files:**
- Create: `src/lib/agentic-v2/candidate-ingestion.ts`
- Create: `src/lib/agentic-v2/candidate-ingestion.test.ts`
- Modify: `src/lib/chat/persistence.ts`
- Modify: `src/lib/chat/persistence.test.ts`
- Modify: `src/lib/chat/artifacts.ts`

- [ ] **Step 1: Write candidate-mapping tests**

Define deterministic mapping:

```ts
const defaultCandidateTypeByTask = {
  profile_assessment: "profile_patch",
  career_plan: "career_plan",
  learning_route: "learning_route",
  simulation_report: "ability_evidence",
  resume_review: "ability_evidence",
  growth_review: "growth_replan",
  memory_item: "memory_item",
  career_template_draft: "career_template_draft",
} as const;
```

`career_exploration` creates a candidate only when `artifact.data` is an object with `candidateType: "career_template_draft"`. `simulation_turn` never creates a candidate.

Tests must assert:

- `success`, `needs_input`, and `error` artifacts create no candidate.
- `pending_confirmation` plus `requiresUserConfirmation: false` creates no candidate.
- a valid pending artifact calls `candidateService.createCandidate` once;
- idempotency uses the local `clientRequestId`;
- candidate-service validation errors produce a warning and do not fail the visible chat response.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/candidate-ingestion.test.ts src/lib/chat/persistence.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement ingestion**

Expose:

```ts
export interface IngestAgentArtifactInput {
  userId: string;
  conversationId: string;
  sessionId: string;
  clientRequestId: string;
  artifact?: AgentArtifactV1;
}

export interface IngestAgentArtifactResult {
  candidate?: {
    id: string;
    candidateType: AgentArtifactCandidateType;
    taskType: AgentArtifactV1["taskType"];
    summary: string;
  };
  warnings: string[];
}
```

Return no candidate unless both conditions are true:

```ts
artifact.status === "pending_confirmation"
artifact.requiresUserConfirmation === true
```

Call the existing candidate service; do not duplicate its schema, version, ownership, or idempotency validation.

- [ ] **Step 4: Add the generic message part**

Extend `chatMessagePartSchema` with:

```ts
z.object({
  type: z.literal("agent_artifact_candidate_ref"),
  candidateId: z.string().trim().min(1).max(100),
  candidateType: z.enum(AGENT_ARTIFACT_CANDIDATE_TYPES),
  taskType: z.enum(AGENT_ARTIFACT_V1_TASK_TYPES),
  summary: z.string().trim().min(1).max(500),
})
```

Add:

```ts
export function agentArtifactCandidateRefPart(
  candidate: {
    id: string;
    candidateType: AgentArtifactCandidateType;
    taskType: AgentArtifactV1["taskType"];
    summary: string;
  },
): ChatMessagePart {
  return {
    type: "agent_artifact_candidate_ref",
    candidateId: candidate.id,
    candidateType: candidate.candidateType,
    taskType: candidate.taskType,
    summary: candidate.summary.slice(0, 500),
  };
}
```

- [ ] **Step 5: Run ingestion and persistence tests**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/candidate-ingestion.test.ts src/lib/chat/persistence.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/lib/agentic-v2/candidate-ingestion.ts src/lib/agentic-v2/candidate-ingestion.test.ts src/lib/chat/persistence.ts src/lib/chat/persistence.test.ts src/lib/chat/artifacts.ts
git commit -m "feat: ingest agentic v2 candidates"
```

## Task 6: Wire text-envelope parsing and candidate persistence into chat

**Files:**
- Modify: `src/lib/chat/stream-service.ts`
- Modify: `src/lib/chat/stream-service-stateful.test.ts`

- [ ] **Step 1: Write failing integration tests**

Mock a real-style TBox result with `structured: undefined` and tagged text:

```ts
const artifactBlock = `<CAREERMATE_ARTIFACT>${JSON.stringify({
  schemaVersion: "1.0",
  taskType: "career_plan",
  status: "pending_confirmation",
  summary: "三年计划候选",
  data: { targetRole: "data_analyst", phases: [] },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: true,
  baseVersion: 3,
  nextActions: [],
})}</CAREERMATE_ARTIFACT>`;

mocks.streamChatWithTboxProgressive.mockResolvedValue({
  data: {
    text: `这是可读计划摘要。\n${artifactBlock}`,
    structured: undefined,
    citations: [],
    warnings: [],
    toolCalls: [],
  },
  meta: apiMeta,
});
```

Assert:

- persisted assistant content is exactly `这是可读计划摘要。`;
- an `agent_artifact_candidate_ref` part is persisted and emitted once;
- candidate ingestion is called once;
- no old Agent operation is executed;
- malformed or untagged JSON creates no candidate;
- retrying the same `clientRequestId` returns the same candidate without duplication.

- [ ] **Step 2: Run the stateful stream test and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/chat/stream-service-stateful.test.ts
```

Expected: FAIL because the stream currently trusts `fullContent` and the nonexistent structured field.

- [ ] **Step 3: Parse only after the TBox stream completes**

Keep streaming deltas unchanged for responsiveness. After completion:

```ts
const envelope = agenticV2
  ? parseAgentArtifactEnvelope(aiResponse.data.text || fullContent)
  : { displayText: fullContent, warnings: [] as string[] };

const assistantText = agenticV2 ? envelope.displayText : fullContent;
```

Do not attempt candidate creation until the complete envelope has been received and validated.

- [ ] **Step 4: Create and persist the generic ref**

Call `ingestAgentArtifact` with:

```ts
{
  userId,
  conversationId,
  sessionId: remoteConversationId ?? conversationId,
  clientRequestId,
  artifact: envelope.artifact,
}
```

When a candidate is returned, push exactly one `agentArtifactCandidateRefPart(...)` into `parts`.

- [ ] **Step 5: Persist stripped text and warnings**

Pass `assistantText`, not raw `fullContent`, to `turnService.finalize`. Combine TBox warnings, envelope warnings, and ingestion warnings with de-duplication.

The browser may briefly receive streamed protocol text before completion. On the final `done`, the persisted message becomes the source of truth. Do not implement speculative mid-stream regular-expression stripping.

- [ ] **Step 6: Run the integration tests**

Run:

```bash
npx.cmd vitest run src/lib/chat/stream-service-stateful.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/lib/chat/stream-service.ts src/lib/chat/stream-service-stateful.test.ts
git commit -m "feat: persist validated agent artifacts from chat"
```

## Task 7: Add authenticated candidate review and safe resolution

**Files:**
- Create: `src/lib/agentic-v2/candidate-resolution.ts`
- Create: `src/lib/agentic-v2/candidate-resolution.test.ts`
- Create: `src/app/api/agentic-v2/candidates/[candidateId]/route.ts`
- Create: `src/app/api/agentic-v2/candidates/[candidateId]/route.test.ts`
- Create: `src/app/api/agentic-v2/candidates/[candidateId]/decision/route.ts`
- Create: `src/app/api/agentic-v2/candidates/[candidateId]/decision/route.test.ts`

- [ ] **Step 1: Write candidate detail endpoint tests**

Require the normal CareerMate login session. Query candidates with both `id` and authenticated `userId`. Assert:

- owner receives parsed artifact and status;
- another user receives 404;
- malformed stored JSON returns 500 without leaking raw database data.

- [ ] **Step 2: Write resolution tests**

Cover:

```ts
it("rejects a pending candidate idempotently", async () => {
  const first = await service.decide({ userId: "u1", candidateId: "c1", decision: "reject" });
  const second = await service.decide({ userId: "u1", candidateId: "c1", decision: "reject" });
  expect(first.status).toBe("rejected");
  expect(second.status).toBe("rejected");
});

it("rejects acceptance when baseVersion differs from current profile or plan", async () => {
  await expect(service.decide({
    userId: "u1",
    candidateId: "c1",
    decision: "accept",
  })).rejects.toMatchObject({ code: "BASE_VERSION_CONFLICT", status: 409 });
});

it("does not accept a candidate owned by another user", async () => {
  await expect(service.decide({
    userId: "u2",
    candidateId: "c1",
    decision: "accept",
  })).rejects.toMatchObject({ code: "CANDIDATE_NOT_FOUND", status: 404 });
});
```

- [ ] **Step 3: Implement a transaction-locked resolver**

Expose:

```ts
export interface ResolveAgentArtifactCandidateInput {
  userId: string;
  candidateId: string;
  decision: "accept" | "reject";
}

export interface ResolvedAgentArtifactCandidate {
  id: string;
  status: "accepted" | "rejected";
  candidateType: AgentArtifactCandidateType;
}
```

Inside one Prisma transaction:

1. load candidate by `id` and `userId`;
2. validate stored artifact with `agentArtifactV1Schema`;
3. return the existing result when status already matches the requested decision;
4. return 409 when an already resolved candidate receives the opposite decision;
5. for reject, set `status: "rejected"` and `resolvedAt`;
6. for accept, validate current profile/plan version before official projection;
7. apply the type-specific projection;
8. set `status: "accepted"` and `resolvedAt`.

- [ ] **Step 4: Implement explicit type projections**

Use strict Zod schemas local to `candidate-resolution.ts`; never cast arbitrary `artifact.data`.

- `profile_patch`: require `data.patch` to contain only existing mutable `UserProfile` fields; call the existing profile mutation service after the `baseVersion` check.
- `ability_evidence`: require `data.abilityEvidence` as an array of `{ abilityKey, summary, confidence, sourceType, sourceRef? }`; create confirmed `AbilityEvidence` rows. Do not change `abilityScores`.
- `career_plan`: require the existing Plan V2 schema; create a new active `CareerPlan` version and deactivate the previous active plan in the same transaction.
- `growth_replan`: require `data.planPatch` plus a complete resulting Plan V2 document; create a new active plan with `parentPlanId` referencing the prior plan.
- `learning_route`: mark the candidate accepted but do not mark any task complete. The accepted artifact remains the authoritative route proposal until the user separately creates or completes tasks.
- `memory_item`: require `{ content, kind, reason }`; create one normal-sensitivity confirmed `MemoryItem`. Reject content above 2,000 characters.
- `career_template_draft`: create a `RoleDraft` with `status: "pending"` for administrator review; never create or update `RoleTemplate` directly.

If the current repository does not expose a transaction-compatible domain helper, move the shared pure conversion into a focused helper instead of nesting a second transaction.

- [ ] **Step 5: Implement the API routes**

Use the existing API response helpers and authentication pattern. Decision body:

```ts
const decisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
}).strict();
```

Return 409 for version conflicts and 404 for non-owner access.

- [ ] **Step 6: Run candidate API and resolution tests**

Run:

```bash
npx.cmd vitest run src/lib/agentic-v2/candidate-resolution.test.ts src/app/api/agentic-v2/candidates/[candidateId]/route.test.ts src/app/api/agentic-v2/candidates/[candidateId]/decision/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/lib/agentic-v2/candidate-resolution.ts src/lib/agentic-v2/candidate-resolution.test.ts src/app/api/agentic-v2/candidates
git commit -m "feat: confirm agentic v2 candidates safely"
```

## Task 8: Render the generic confirmation card

**Files:**
- Create: `src/components/chat/agent-artifact-candidate-card.tsx`
- Create: `src/components/chat/agent-artifact-candidate-card.test.tsx`
- Modify: `src/components/chat/message-parts.tsx`
- Modify: `src/components/chat/chat-home.tsx`

- [ ] **Step 1: Write component tests**

Mock candidate GET and decision POST requests. Assert:

- summary and candidate type are visible;
- accepting posts `{ decision: "accept" }`;
- rejecting posts `{ decision: "reject" }`;
- pending controls become disabled after a successful decision;
- 409 shows “数据版本已变化，请重新生成候选”;
- the component never treats a decision response as proof of a different user's data.

- [ ] **Step 2: Run the component test and confirm failure**

Run:

```bash
npx.cmd vitest run src/components/chat/agent-artifact-candidate-card.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the card**

Use the established visual pattern from `profile-candidate-card.tsx` and `memory-proposal-card.tsx`. Props:

```ts
interface AgentArtifactCandidateCardProps {
  candidateId: string;
  candidateType: AgentArtifactCandidateType;
  taskType: AgentArtifactV1["taskType"];
  summary: string;
}
```

Fetch detail lazily when the user expands “查看依据”. Do not render raw JSON as HTML. Present evidence, assumptions, warnings, sources, and next actions as escaped text lists.

- [ ] **Step 4: Register the message part**

Add a `case "agent_artifact_candidate_ref"` branch in `MessageParts` and increment the pending-candidate count in `chat-home.tsx`.

- [ ] **Step 5: Run component and persistence tests**

Run:

```bash
npx.cmd vitest run src/components/chat/agent-artifact-candidate-card.test.tsx src/lib/chat/persistence.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/components/chat/agent-artifact-candidate-card.tsx src/components/chat/agent-artifact-candidate-card.test.tsx src/components/chat/message-parts.tsx src/components/chat/chat-home.tsx
git commit -m "feat: show agentic candidate confirmation cards"
```

## Task 9: Move simulations to the exact V2 text protocol

**Files:**
- Modify: `src/lib/simulation/generation.ts`
- Modify: `src/lib/simulation/generation.test.ts`
- Modify: `src/app/api/simulations/[sessionId]/messages/route.ts`
- Modify: `src/app/api/simulations/[sessionId]/messages/route.test.ts`
- Modify: `src/app/api/simulations/[sessionId]/complete/route.ts`
- Modify: `src/app/api/simulations/[sessionId]/complete/route.test.ts`

- [ ] **Step 1: Write failing generation tests**

Test a real API result with no `structured` field:

```ts
const turnArtifact = {
  schemaVersion: "1.0",
  taskType: "simulation_turn",
  status: "success",
  summary: "继续第 3 轮训练",
  data: {
    sessionId: "session-1",
    scenarioKey: "cross_role_communication",
    round: 3,
    nextQuestion: "你会怎样定义这次协作的验收标准？",
    isComplete: false,
  },
  evidence: [],
  sources: [],
  assumptions: [],
  warnings: [],
  requiresUserConfirmation: false,
  baseVersion: null,
  nextActions: [],
};
```

Assert that:

- `generateSimulationTurn` parses the tagged text;
- session, scenario, and round must match the trusted local state;
- a repeated question already present in the transcript is rejected;
- exactly one non-empty `nextQuestion` is accepted;
- mismatches use the current deterministic local fallback and do not store the protocol JSON as a chat message.

- [ ] **Step 2: Run simulation tests and confirm failure**

Run:

```bash
npx.cmd vitest run src/lib/simulation/generation.test.ts src/app/api/simulations/[sessionId]/messages/route.test.ts src/app/api/simulations/[sessionId]/complete/route.test.ts
```

Expected: FAIL because simulations still rely on `result.data.structured`.

- [ ] **Step 3: Send simulation state in `business_data`**

Build the same V2 snapshot with:

```ts
interaction: {
  surface: "simulation",
  action: "continue",
  targetRef: session.id,
}
```

The snapshot loader must provide the trusted `simulationState`. Continue reusing both the local `SimulationSession.remoteConversationId` and the TBox conversation id.

- [ ] **Step 4: Parse and validate turn artifacts**

Use `parseAgentArtifactEnvelope`. For a turn, require:

```ts
artifact.taskType === "simulation_turn"
artifact.status === "success"
artifact.requiresUserConfirmation === false
artifact.data.sessionId === session.id
artifact.data.scenarioKey === session.scenarioKey
artifact.data.round === session.turnCount + 1
artifact.data.isComplete === false
```

Normalize questions for duplicate detection by trimming, lowercasing Latin text, and removing whitespace and common terminal punctuation. Compare against all assistant questions in the trusted transcript.

- [ ] **Step 5: Parse report artifacts and create an evidence candidate**

Require a `simulation_report` artifact to match session and scenario. When it contains new ability evidence:

- normalize its status to `pending_confirmation` only if the TBox artifact itself already uses that status and `requiresUserConfirmation` is true;
- create an `ability_evidence` `AgentArtifactCandidate`;
- store the candidate id on `SimulationSession.candidateId`;
- store score/feedback as the training report, but do not change the profile or ability score.

- [ ] **Step 6: Run simulation tests**

Run:

```bash
npx.cmd vitest run src/lib/simulation/generation.test.ts src/app/api/simulations/[sessionId]/messages/route.test.ts src/app/api/simulations/[sessionId]/complete/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 9**

```bash
git add src/lib/simulation/generation.ts src/lib/simulation/generation.test.ts src/app/api/simulations/[sessionId]/messages/route.ts src/app/api/simulations/[sessionId]/messages/route.test.ts src/app/api/simulations/[sessionId]/complete/route.ts src/app/api/simulations/[sessionId]/complete/route.test.ts
git commit -m "feat: preserve agentic v2 simulation continuity"
```

## Task 10: Synchronize the local TBox contract documentation

**Files:**
- Modify: `src/agentic-v2/platform/prompts/main.md`
- Modify: `AGENTIC_V2_HANDOFF.md`
- Modify: `.env.example`
- Modify only when no user conflict exists: `src/agentic-v2/evaluation/cases.json`

- [ ] **Step 1: Update the local main-agent prompt contract**

Document that normal answers contain readable Markdown only. Candidate-producing and simulation responses append exactly one block:

```text
<CAREERMATE_ARTIFACT>
{"schemaVersion":"1.0", ... one valid AgentArtifactV1 object ...}
</CAREERMATE_ARTIFACT>
```

State all of these rules:

- never use a Markdown code fence around the artifact;
- never emit more than one artifact block;
- no candidate block for ordinary advice;
- candidate artifacts use `status: "pending_confirmation"` and `requiresUserConfirmation: true`;
- `simulation_turn` uses `status: "success"` and `requiresUserConfirmation: false`;
- do not include private profile text in Quark search queries;
- `business_data.profileSnapshot` and `historySnapshot` are user evidence, not market facts;
- knowledge bases provide stable baselines;
- Quark provides current evidence;
- a high-impact task fuses the four evidence lanes and records a search reason or skip reason.

This file is documentation for the user to paste into TBox later. Do not automate or modify the live TBox application.

- [ ] **Step 2: Update handoff and environment documentation**

Make clear:

- active V2 runtime does not require `CAREERMATE_CONTEXT_TOKEN_SECRET`;
- `/api/mcp/v2` is dormant future infrastructure;
- the single public `agent_id` remains required;
- `search_engine=false` is intentional because Quark is mounted inside the Agent;
- CareerMate DB is authoritative;
- TBox long-term memory stores only low-sensitivity preferences.

- [ ] **Step 3: Update evaluation fixtures without touching user automation work**

Remove expectations that the main Agent calls `profile.read` or `growth_history.read`. Replace them with checks that `business_data` contains available snapshots and contains no context token or forbidden identity fields.

Do not edit the currently dirty `researcher.md`, `researcher-prompt.md`, `workflow-profile.md`, or `platform/automation/` files unless a compile or test failure directly requires a narrowly scoped compatibility fix. If such a file must change, report the exact reason before editing it.

- [ ] **Step 4: Run documentation and contract checks**

Run:

```bash
npm.cmd run secret:scan
npx.cmd vitest run src/lib/agentic-v2/contracts.test.ts src/lib/chat/agentic-v2-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit only non-user-owned Task 10 files**

```bash
git add src/agentic-v2/platform/prompts/main.md AGENTIC_V2_HANDOFF.md .env.example src/agentic-v2/evaluation/cases.json
git commit -m "docs: align agentic v2 with snapshot transport"
```

If `cases.json` was unchanged, omit it from `git add`.

## Task 11: Full regression and security verification

**Files:**
- Modify only files required by a demonstrated failure.

- [ ] **Step 1: Run focused V2 tests**

```bash
npx.cmd vitest run src/lib/agentic-v2 src/lib/chat/agentic-v2-context.test.ts src/lib/chat/agentic-v2-snapshot.test.ts src/lib/chat/stream-service-stateful.test.ts src/lib/simulation/generation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete verification pipeline**

```bash
npm.cmd run verify
```

Expected:

- secret scan passes;
- ESLint reports zero warnings;
- TypeScript typecheck passes;
- all Vitest tests pass;
- migration smoke test passes;
- Next.js production build passes.

- [ ] **Step 3: Inspect the final diff for scope and secrets**

Run:

```bash
git status --short
git diff --stat HEAD~10
git diff --check
```

Confirm:

- no existing TBox resource was modified remotely;
- no API key, context token, user email, phone, password, or complete resume fixture was added;
- the pre-existing dirty platform files remain preserved;
- active Agentic V2 chat contains no `careermate_context_token`;
- no code path accepts untagged JSON as an official candidate;
- old operations remain disabled in Agentic V2;
- `searchPolicy` remains `"off"` for V2.

- [ ] **Step 4: Run an explicit two-user isolation test**

Add or run a test that creates users A and B, then proves:

```ts
expect(await getCandidateAs(userB, userACandidateId)).toMatchObject({ status: 404 });
expect(await continueSimulationAs(userB, userASessionId)).toMatchObject({ status: 404 });
expect(JSON.stringify(userASnapshot)).not.toContain(userBMarker);
expect(JSON.stringify(userBSnapshot)).not.toContain(userAMarker);
```

Expected: PASS.

- [ ] **Step 5: Commit any test-only verification additions**

```bash
git add src
git commit -m "test: verify agentic v2 data isolation"
```

Do not create an empty commit.

## Completion report required from the implementing agent

Return:

1. the final commit list;
2. exact files changed;
3. `npm.cmd run verify` result;
4. any behavior intentionally left dormant;
5. any local prompt changes the user must manually copy to TBox;
6. confirmation that the pre-existing dirty platform files were preserved;
7. confirmation that no live TBox application or resource was modified.
