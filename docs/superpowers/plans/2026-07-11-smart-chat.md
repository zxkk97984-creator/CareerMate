# CareerMate Smart Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a page-scoped, multi-turn CareerMate chat that safely uses the current user's profile, active plan, confirmed non-sensitive memories, and the most relevant Tbox knowledge base.

**Architecture:** A server-side chat orchestrator classifies intent, reads allowlisted local context, retrieves at most three knowledge items, and builds one bounded prompt for both streaming and non-streaming chat routes. A focused React feature owns the page-scoped transcript and remote Tbox conversation ID, while the SSE parser merges deltas and returns context/done metadata.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/SQLite, Zod, Vitest, Playwright, Tbox OpenAPI/SSE.

---

## File Map

- Create `src/lib/chat/types.ts`: public chat intent and context metadata types.
- Create `src/lib/chat/context.ts`: pure intent classification, safe context shaping, prompt construction, and length limits.
- Create `src/lib/chat/context.test.ts`: pure routing, privacy, and prompt tests.
- Create `src/lib/chat/server.ts`: Prisma/Tbox orchestration for the authenticated user.
- Create `src/lib/chat/server.test.ts`: dependency-injected orchestration tests.
- Modify `src/app/api/tbox/chat/route.ts`: use the shared orchestrator for non-stream chat.
- Modify `src/app/api/tbox/chat/route.test.ts`: verify raw logging and enhanced prompt handoff.
- Modify `src/app/api/tbox/chat/stream/route.ts`: use the orchestrator and emit a `context` event.
- Modify `src/app/api/tbox/chat/stream/route.test.ts`: verify context/message/done event order.
- Modify `src/lib/tbox/frontend-sse.ts`: expose context and completion metadata while preserving delta streaming.
- Modify `src/lib/tbox/frontend-sse.test.ts`: cover delta merge inputs, context, done, and errors.
- Create `src/features/chat/chat-view.tsx`: page-scoped transcript, remote conversation continuation, source badges, and new-chat action.
- Modify `src/components/workspace.tsx`: mount the focused feature and remove the inline chat implementation.
- Modify `e2e/p0-flows.spec.ts`: exercise two chat turns and new-chat reset with deterministic intercepted SSE.

### Task 1: Pure Chat Context and Intent Rules

**Files:**
- Create: `src/lib/chat/types.ts`
- Create: `src/lib/chat/context.ts`
- Test: `src/lib/chat/context.test.ts`

- [ ] **Step 1: Write failing intent and privacy tests**

Create tests that assert:

```ts
expect(classifyCareerChatIntent("数据分析师需要哪些能力？")).toBe("roleCompetency");
expect(classifyCareerChatIntent("推荐一门 SQL 课程和作品集项目")).toBe("learningResources");
expect(classifyCareerChatIntent("陪我练一次跨岗位沟通")).toBe("simulationScenes");
expect(classifyCareerChatIntent("如何删除长期记忆并导出数据？")).toBe("ethicsRules");
expect(classifyCareerChatIntent("你好")).toBeNull();
```

Also assert that `createSafeCareerContext` keeps allowlisted profile/plan fields, keeps at most five confirmed normal memories, and omits `passwordHash`, `tokenHash`, sensitive memories, raw progress logs, and extra object properties.

- [ ] **Step 2: Run the test and verify RED**

Run:

```cmd
npm.cmd test -- src/lib/chat/context.test.ts
```

Expected: FAIL because the chat modules do not exist.

- [ ] **Step 3: Implement types and deterministic routing**

Define:

```ts
export type CareerChatIntent =
  | "roleCompetency"
  | "learningResources"
  | "simulationScenes"
  | "ethicsRules";

export interface CareerChatContextMeta {
  intent: CareerChatIntent | null;
  usedProfile: boolean;
  usedPlan: boolean;
  usedMemoryCount: number;
  knowledgeSources: string[];
  retrievalMeta: AiExecutionMeta | null;
}
```

Use keyword scoring with explicit keyword arrays. On ties, use the order `ethicsRules`, `simulationScenes`, `learningResources`, `roleCompetency` so privacy and training requests are not swallowed by generic role words.

- [ ] **Step 4: Implement bounded safe context and prompt building**

`createSafeCareerContext` accepts plain dependency output and returns only:

```ts
{
  profile: {
    educationStage,
    major,
    targetRole,
    targetRoleLabel,
    weeklyAvailableHours,
    learningPreference,
    abilityScores,
  },
  currentPlan: {
    targetRole,
    currentMonthIndex,
    goal,
    pendingTasks,
    assumptions,
    riskNotes,
  },
  memories: string[],
}
```

Limit each knowledge snippet to 800 characters, each memory to 240 characters, the safe-context JSON to 4,000 characters, and the final enhanced prompt to 8,000 characters. `buildCareerChatPrompt` must end with the exact raw user question and require the response structure “直接结论 / 依据 / 下一步”.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Task 1 test command. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```cmd
git add src/lib/chat/types.ts src/lib/chat/context.ts src/lib/chat/context.test.ts
git commit -m feat:chat-context-routing
```

### Task 2: Server-Side Chat Orchestrator

**Files:**
- Create: `src/lib/chat/server.ts`
- Test: `src/lib/chat/server.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Inject these dependencies rather than mocking Prisma internals:

```ts
interface CareerChatDependencies {
  loadProfile(userId: string): Promise<unknown>;
  loadActivePlan(userId: string): Promise<unknown>;
  loadMemories(userId: string): Promise<unknown[]>;
  retrieve(input: RetrievalInput): Promise<AiResult<{ items: RetrievalItem[] }>>;
}
```

Tests must verify:

- a resource question calls `retrieve` once with `datasetKey: "learningResources"` and `limit: 3`;
- a greeting does not retrieve a knowledge base;
- disabled memory produces zero memory entries;
- retrieval failure produces an empty knowledge list and safe context rather than failing chat;
- returned metadata contains dataset intent, source file names, and retrieval execution metadata.

- [ ] **Step 2: Run the server test and verify RED**

```cmd
npm.cmd test -- src/lib/chat/server.test.ts
```

Expected: FAIL because `prepareCareerChat` is missing.

- [ ] **Step 3: Implement dependency-injected preparation**

Export:

```ts
export async function prepareCareerChat(
  input: { userId: string; question: string },
  dependencies?: Partial<CareerChatDependencies>,
): Promise<{
  enhancedQuestion: string;
  contextMeta: CareerChatContextMeta;
}>;
```

Production dependencies use Prisma allowlist `select` clauses. Query only confirmed normal memories when `profile.memoryEnabled` is true. Parse JSON fields with `parseJson`, select the active plan, locate `currentMonthIndex`, and call `retrieveWithTbox` with `getTboxConfig()` for the classified dataset.

- [ ] **Step 4: Run server tests and verify GREEN**

Run the Task 2 command. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```cmd
git add src/lib/chat/server.ts src/lib/chat/server.test.ts
git commit -m feat:server-chat-orchestrator
```

### Task 3: Integrate Non-Streaming and Streaming Routes

**Files:**
- Modify: `src/app/api/tbox/chat/route.ts`
- Modify: `src/app/api/tbox/chat/route.test.ts`
- Modify: `src/app/api/tbox/chat/stream/route.ts`
- Modify: `src/app/api/tbox/chat/stream/route.test.ts`

- [ ] **Step 1: Add failing route tests**

Mock `prepareCareerChat` to return an enhanced question and context metadata. Assert both routes send the enhanced question to the Tbox adapter while the progress log still stores the user's raw question. For streaming output assert this order:

```text
event: context
event: message
event: done
```

The `context` data must contain only `CareerChatContextMeta`; no profile values or knowledge content may be sent back to the browser.

- [ ] **Step 2: Run route tests and verify RED**

```cmd
npm.cmd test -- src/app/api/tbox/chat/route.test.ts src/app/api/tbox/chat/stream/route.test.ts
```

Expected: FAIL because the routes still pass the raw question and emit no context event.

- [ ] **Step 3: Integrate the orchestrator**

In both routes:

```ts
const prepared = await prepareCareerChat({ userId: user.id, question: parsed.data.question });
```

Pass `prepared.enhancedQuestion` to Tbox, keep `parsed.data.question` in the progress log, and preserve the incoming remote `conversationId`. In the stream route enqueue `context` before normalized Tbox events.

- [ ] **Step 4: Run route tests and verify GREEN**

Run the Task 3 test command. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```cmd
git add src/app/api/tbox/chat/route.ts src/app/api/tbox/chat/route.test.ts src/app/api/tbox/chat/stream/route.ts src/app/api/tbox/chat/stream/route.test.ts
git commit -m feat:orchestrate-chat-routes
```

### Task 4: Frontend SSE Result Contract

**Files:**
- Modify: `src/lib/tbox/frontend-sse.ts`
- Modify: `src/lib/tbox/frontend-sse.test.ts`

- [ ] **Step 1: Write failing parser tests**

Change the consumer call to:

```ts
const result = await consumeFrontendSseResponse(response, {
  onDelta: (content) => deltas.push(content),
  onContext: (context) => contexts.push(context),
});
```

Expect `deltas.join("")` to form one answer and expect:

```ts
result.conversationId === "remote-conversation-1";
result.meta.actualMode === "api";
contexts[0].knowledgeSources.includes("role-ai-product-manager");
```

Retain existing malformed content type, provider error, incomplete stream, CRLF, and reader cancellation coverage.

- [ ] **Step 2: Run the parser test and verify RED**

```cmd
npm.cmd test -- src/lib/tbox/frontend-sse.test.ts
```

Expected: FAIL because the current function accepts only an `onDelta` function and returns no result.

- [ ] **Step 3: Implement the result contract**

Add typed callbacks and return:

```ts
{
  conversationId: string | null;
  meta: AiExecutionMeta | null;
}
```

Parse `context`, `message`, `done`, and `error`. Capture metadata from message or done events without exposing raw internal context.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run the Task 4 command. Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```cmd
git add src/lib/tbox/frontend-sse.ts src/lib/tbox/frontend-sse.test.ts
git commit -m feat:frontend-sse-chat-contract
```

### Task 5: Focused Smart Chat UI

**Files:**
- Create: `src/features/chat/chat-view.tsx`
- Modify: `src/components/workspace.tsx`
- Modify: `e2e/p0-flows.spec.ts`

- [ ] **Step 1: Add a failing two-turn end-to-end test**

Intercept `**/api/tbox/chat/stream` and return deterministic SSE. Assert the first request has no conversation ID, the second request has `remote-1`, two user messages and two complete assistant messages remain visible, and “开始新对话” clears all messages and the conversation ID.

- [ ] **Step 2: Run the new E2E test and verify RED**

```cmd
npm.cmd run test:e2e -- --grep "smart chat keeps a page-scoped conversation"
```

Expected: FAIL because the existing view clears messages and does not preserve the remote conversation ID.

- [ ] **Step 3: Implement the focused feature**

Create `ChatView` with:

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
```

On send, append the user message and one empty assistant message. Append every delta to that assistant message. Store the returned remote conversation ID, render context/source badges, disable duplicate sends, preserve the draft on error, and provide a “开始新对话” reset action. Do not use localStorage or database persistence.

- [ ] **Step 4: Remove the inline view and mount the feature**

Import `ChatView` in `workspace.tsx`, delete the inline implementation, and keep the existing `setNotice` contract.

- [ ] **Step 5: Run E2E and relevant unit tests**

```cmd
npm.cmd test -- src/lib/tbox/frontend-sse.test.ts src/lib/chat/context.test.ts src/lib/chat/server.test.ts
npm.cmd run test:e2e -- --grep "smart chat keeps a page-scoped conversation"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```cmd
git add src/features/chat/chat-view.tsx src/components/workspace.tsx e2e/p0-flows.spec.ts
git commit -m feat:page-scoped-smart-chat
```

### Task 6: Real Tbox and Browser Verification

**Files:**
- Modify only if a verified integration defect is found; use a new failing test before any fix.

- [ ] **Step 1: Run direct authenticated API smoke tests**

Verify a role question and a follow-up. Confirm the first response returns a remote conversation ID, the second sends that ID, both return `actualMode: "api"`, and the role response reports the role competency source.

- [ ] **Step 2: Verify rendered behavior in the Browser plugin**

Test: login → AI 聊天 → send role question → observe one complete assistant bubble and source badges → send follow-up without repeating the role → observe coherent answer → start new conversation → confirm reset. Check URL, DOM content, framework overlay, console warnings/errors, and screenshot evidence.

- [ ] **Step 3: Inspect Tbox configuration only if evidence requires it**

If the response remains generic despite verified CareerMate context, open the user's Tbox application configuration. Ask the user to take over for login, CAPTCHA, or permission confirmation. Check the published Prompt, knowledge-base attachment, model selection, and version publication; do not view or expose API keys.

### Task 7: Full Verification and Final Commit

**Files:**
- All changed files from Tasks 1–6.

- [ ] **Step 1: Run formatting and repository checks**

```cmd
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files changed.

- [ ] **Step 2: Run the full gate**

```cmd
npm.cmd run verify
npm.cmd run test:e2e
```

Expected: secret scan, lint, typecheck, unit tests, migration smoke, production build, and all Playwright flows pass.

- [ ] **Step 3: Re-run one live chat smoke test after the full gate**

Expected: HTTP 200, `actualMode: "api"`, `degraded: false`, a remote conversation ID, and at least one knowledge source.

- [ ] **Step 4: Commit any final verified adjustments**

```cmd
git add src e2e docs/superpowers/plans/2026-07-11-smart-chat.md
git commit -m feat:complete-smart-chat-loop
```
