# CareerMate Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复代码审查发现的跨用户插件访问、React Hook、计划生成可靠性、动态画像反馈、来源校验和事务一致性问题，并以真实端到端流程证明修复。

**Architecture:** 保留现有 Next.js、Prisma 和 SQLite。所有插件入口统一使用服务端 principal；聊天计划使用真实 `CareerPlan` 记录作为可恢复任务，由受保护的执行接口完成生成，前端轮询并可重试；候选、报告和审核写入统一通过事务服务。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Prisma、SQLite、Zod、Vitest、Playwright、百宝箱适配器。

---

## File Map

- `src/lib/plugin-auth.ts`: 插件 principal 和 scope 校验。
- `src/app/api/mcp/**/route.ts`: 旧 REST 插件兼容入口，只接受绑定用户。
- `src/lib/plans/generation-service.ts`: 计划占位记录、原子领取、生成、失败与重试状态机。
- `src/app/api/plans/[planId]/generate/route.ts`: 用户所有权保护的计划执行接口。
- `src/lib/chat/artifact-service.ts`: 快速创建真实计划引用，并合并当前会话候选引用。
- `src/components/chat/message-parts.tsx`: 无条件 Hook、计划轮询/重试、API 错误传播。
- `src/lib/careers/exploration-schema.ts`: 来源可信度判别校验。
- `src/lib/careers/exploration-service.ts`: 报告提交事务。
- `src/app/api/admin/role-drafts/[id]/approve/route.ts`: Admin 入库事务。
- `e2e/chat-home.spec.ts`: 计划和失败状态真实聊天闭环。

### Task 1: Lock legacy REST plugins to the server principal

**Files:**
- Modify: `src/lib/plugin-auth.ts`
- Modify: `src/app/api/mcp/profile/read/route.ts`
- Modify: `src/app/api/mcp/profile/update-candidate/route.ts`
- Modify: `src/app/api/mcp/progress/update/route.ts`
- Create: `src/app/api/mcp/legacy-routes.test.ts`

- [ ] **Step 1: Write failing cross-user and scope tests**

Mock `getPluginPrincipal` and assert all three routes reject a body whose `userId` differs from `principal.userId`; also assert missing required scope returns 403.

```ts
mocks.getPluginPrincipal.mockReturnValue({ userId: "user-1", scopes: ["profile:read"] });
const response = await profileReadPost(request({ userId: "user-2" }));
expect(response.status).toBe(403);
expect(mocks.findProfile).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm.cmd test -- --run src/app/api/mcp/legacy-routes.test.ts`

Expected: FAIL because the legacy routes trust `parsed.data.userId` and do not check scopes.

- [ ] **Step 3: Add a shared principal guard**

Add this behavior to `plugin-auth.ts`:

```ts
export function requirePluginScope(
  request: Request,
  scope: string,
  requestedUserId?: string,
): PluginPrincipal | null {
  const principal = getPluginPrincipal(request);
  if (!principal || !principal.scopes.includes(scope)) return null;
  if (requestedUserId && requestedUserId !== principal.userId) return null;
  return principal;
}
```

Update each route to write/read only `principal.userId`. The candidate route must call the existing scoped registry or a shared candidate creation service so field whitelist, ability evidence and transaction rules are identical to standard MCP.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run src/app/api/mcp/legacy-routes.test.ts src/lib/plugin-auth.test.ts src/app/api/mcp/route.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```text
git add src/lib/plugin-auth.ts src/app/api/mcp src/lib/tools
git commit -m "fix: bind legacy plugin routes to server principal"
```

### Task 2: Fix conditional hooks and truthful card actions

**Files:**
- Modify: `src/components/chat/message-parts.tsx`
- Modify: `src/components/chat/profile-candidate-card.tsx`
- Create: `src/components/chat/message-parts.test.tsx` if the current Vitest environment supports DOM; otherwise cover through Playwright in Task 8.

- [ ] **Step 1: Add failing response-error tests**

Assert a candidate PATCH returning `{ ok: false }` leaves the card pending and shows the server message. Assert the generating plan rendering path and normal plan path can reuse the same component without changing Hook order.

```ts
global.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: false, error: { message: "候选已处理" } }), { status: 409 }),
);
```

- [ ] **Step 2: Verify lint currently fails**

Run: `npm.cmd run lint`

Expected: FAIL at `message-parts.tsx` with two `react-hooks/rules-of-hooks` errors.

- [ ] **Step 3: Split the plan placeholder and centralize API parsing**

Create a module-local `GeneratingPlanCard` with no Hooks. `PlanRef` must call all Hooks before any conditional rendering. Add:

```ts
async function requireOk(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error?.message ?? "操作失败，请稍后重试");
  }
  return body.data;
}
```

Use it for candidate confirmation, plan acceptance, report submission and plan retry. Add error state to cards; only update accepted/submitted state after `requireOk` succeeds.

- [ ] **Step 4: Run lint and focused UI/E2E tests**

Run: `npm.cmd run lint`

Run: `npm.cmd run test:e2e -- e2e/chat-home.spec.ts`

Expected: lint and existing chat tests pass.

- [ ] **Step 5: Commit**

```text
git add src/components/chat
git commit -m "fix: keep chat card state aligned with API results"
```

### Task 3: Enforce trustworthy exploration sources

**Files:**
- Modify: `src/lib/careers/exploration-schema.ts`
- Modify: `src/lib/chat/artifact-service.ts`
- Modify: `src/lib/chat/artifact-service.test.ts`
- Modify: `src/lib/careers/exploration-service.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover empty sources, invalid dates, and live sources without URL.

```ts
expect(explorationReportSchema.safeParse({ ...valid, sources: [] }).success).toBe(false);
expect(explorationSourceSchema.safeParse({ ...source, label: "实时联网调研", url: undefined }).success).toBe(false);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --run src/lib/chat/artifact-service.test.ts src/lib/careers/exploration-service.test.ts`

Expected: new validation assertions fail.

- [ ] **Step 3: Implement discriminating validation and downgrade**

Use `superRefine` so live sources require `http:` or `https:` URL and `accessedAt` matches a valid `YYYY-MM-DD`; change report sources to `.min(1).max(20)`. In `normalizeResearchSources`, retain `实时联网调研` only when API mode is non-degraded and the source passed live-source validation; otherwise change it to `AI分析与推断` and remove the URL.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same Vitest command. Expected: all pass.

- [ ] **Step 5: Commit**

```text
git add src/lib/careers src/lib/chat/artifact-service.ts src/lib/chat/artifact-service.test.ts
git commit -m "fix: require auditable sources for live career reports"
```

### Task 4: Make report submission and admin approval atomic

**Files:**
- Modify: `src/lib/careers/exploration-service.ts`
- Modify: `src/lib/careers/exploration-service.test.ts`
- Modify: `src/app/api/admin/role-drafts/[id]/approve/route.ts`
- Modify: `src/app/api/admin/role-drafts/[id]/approve/route.test.ts`

- [ ] **Step 1: Write transaction tests**

Require `submitForReview` to call `$transaction` and perform report read, draft create and report update on the transaction client. Require Admin approval to perform template upsert, draft update and report update in one transaction.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --run src/lib/careers/exploration-service.test.ts src/app/api/admin/role-drafts/[id]/approve/route.test.ts`

Expected: FAIL because current operations use the root Prisma client independently.

- [ ] **Step 3: Wrap each state transition in one transaction**

For submission, catch the unique `sourceReportId` conflict and return `ALREADY_SUBMITTED` rather than a 500. For Admin approval, re-read the draft inside the transaction and keep the existing idempotent `alreadyApproved` response.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same Vitest command. Expected: all pass.

- [ ] **Step 5: Commit**

```text
git add src/lib/careers src/app/api/admin/role-drafts
git commit -m "fix: make career review transitions atomic"
```

### Task 5: Add a recoverable plan generation state machine

**Files:**
- Create: `src/lib/plans/generation-service.ts`
- Create: `src/lib/plans/generation-service.test.ts`
- Create: `src/app/api/plans/[planId]/generate/route.ts`
- Create: `src/app/api/plans/[planId]/generate/route.test.ts`
- Modify: `src/app/api/plans/[planId]/route.ts`
- Modify: `src/app/api/plans/current/route.ts`

- [ ] **Step 1: Write failing state-machine tests**

Tests must cover creating/reusing a generating plan, atomic claim, successful fill to pending, failure to `generation_failed`, retry, stale `processing` reclaim, user ownership and no duplicate pending plan.

```ts
const created = await service.ensureGenerationPlan({ userId: "u1", conversationId: "c1" });
expect(created.plan.status).toBe("generating");
expect(created.reused).toBe(false);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --run src/lib/plans/generation-service.test.ts src/app/api/plans/[planId]/generate/route.test.ts`

Expected: FAIL because service and route do not exist.

- [ ] **Step 3: Implement the service**

Expose:

```ts
interface PlanGenerationService {
  ensureGenerationPlan(input: { userId: string; conversationId?: string }): Promise<{ plan: CareerPlanDto; reused: boolean }>;
  generate(planId: string, userId: string): Promise<{ plan: CareerPlanDto; executionMeta: AiExecutionMeta }>;
}
```

`ensureGenerationPlan` uses a Prisma transaction and reuses the newest `generating`, `processing` or `pending` row. `generate` claims eligible rows with `updateMany`, permits stale `processing` after two minutes, calls `generatePlanWithTbox`, validates and serializes the plan, then updates the same row to `pending`. On failure it records `generation_failed` and a safe failure code before rethrowing a typed error.

- [ ] **Step 4: Implement the protected route and DTO responses**

POST requires the logged-in owner and calls `generate`; GET plan responses expose status plus safe generation state. Do not expose raw upstream errors or prompts.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same Vitest command plus existing plan tests. Expected: all pass.

- [ ] **Step 6: Commit**

```text
git add src/lib/plans src/app/api/plans
git commit -m "feat: add recoverable chat plan generation"
```

### Task 6: Wire real plan IDs into chat and remove fire-and-forget

**Files:**
- Modify: `src/lib/chat/artifact-service.ts`
- Modify: `src/lib/chat/artifact-service.test.ts`
- Modify: `src/lib/chat/stream-service.ts`
- Modify: `src/components/chat/message-parts.tsx`
- Modify: `src/components/chat/plan-summary-card.tsx`

- [ ] **Step 1: Replace the placeholder test with a real-ID failing test**

```ts
expect(parts).toContainEqual({ type: "plan_ref", planId: "plan-1", version: 3 });
expect(parts).not.toContainEqual(expect.objectContaining({ planId: "__generating__" }));
```

Add tests for polling from `generating` to `pending` and retry after `generation_failed`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run src/lib/chat/artifact-service.test.ts src/lib/chat/stream-service.test.ts`

Expected: FAIL because current code returns `__generating__`.

- [ ] **Step 3: Use the generation service and schedule an after-task**

Artifact creation calls `ensureGenerationPlan` and returns its real ID immediately. The route/request layer uses Next.js `after()` to invoke the protected generation service as a best-effort fast start; all durable state is already committed before scheduling.

`PlanRef` fetches the plan, polls every two seconds while generating/processing, starts or retries POST `/api/plans/:id/generate`, and stops polling on pending/active/failed or unmount.

- [ ] **Step 4: Preserve old placeholders safely**

Existing `__generating__` parts render “旧版生成任务无法恢复，请重新发起计划生成”， without Hooks or network requests. New writes never produce this ID.

- [ ] **Step 5: Run focused tests, lint and typecheck**

Run: `npm.cmd test -- --run src/lib/chat/artifact-service.test.ts src/lib/chat/stream-service.test.ts`

Run: `npm.cmd run lint && npm.cmd run typecheck`

Expected: all pass.

- [ ] **Step 6: Commit**

```text
git add src/lib/chat src/components/chat
git commit -m "fix: persist and recover chat plan generation"
```

### Task 7: Surface plugin-created candidates in the current chat

**Files:**
- Modify: `src/lib/chat/artifact-service.ts`
- Modify: `src/lib/chat/artifact-service.test.ts`
- Modify: `src/lib/tools/careermate-registry.ts`
- Modify: `src/app/api/mcp/profile/update-candidate/route.ts`
- Modify: `docs/tbox/main-agent.md`

- [ ] **Step 1: Write failing candidate-merge tests**

Create one local weekly-hours candidate and two pending conversation candidates from the dependency; assert three unique `profile_candidate_ref` parts. Assert another user's or another conversation's candidates are excluded.

- [ ] **Step 2: Run test and verify RED**

Run: `npm.cmd test -- --run src/lib/chat/artifact-service.test.ts`

Expected: FAIL because artifact creation does not query plugin-created candidates.

- [ ] **Step 3: Add the dependency and merge by ID**

Add:

```ts
listPendingCandidateIds(input: {
  userId: string;
  conversationId: string;
}): Promise<string[]>;
```

Query by all three conditions: `userId`, `sourceConversationId`, `status: "pending"`. Merge with locally created IDs through a `Set` before creating parts.

Update the legacy candidate endpoint to accept evidence fields and `sourceConversationId`, enforce ownership when the conversation exists, and reuse the standard candidate transaction behavior. Update the main-agent document to require the current conversation ID for chat-derived candidates.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run artifact, registry and legacy route tests. Expected: all pass.

- [ ] **Step 5: Commit**

```text
git add src/lib/chat src/lib/tools src/app/api/mcp/profile docs/tbox/main-agent.md
git commit -m "fix: return tbox profile candidates to chat"
```

### Task 8: Add truthful E2E coverage and complete verification

**Files:**
- Modify: `e2e/chat-home.spec.ts`
- Modify: `e2e/p0-flows.spec.ts`
- Modify: `docs/tbox/acceptance-evidence.md`

- [ ] **Step 1: Add a real mock-mode plan E2E**

The test must send “帮我制定一个3个月学习计划”, assert a real plan card leaves generating state, open `/path`, confirm the pending version, reload, and assert the version remains active. It must not rely on the seeded plan alone.

- [ ] **Step 2: Add API failure and source-label E2E assertions**

Intercept candidate PATCH with 409 and assert the card remains pending with an error. For local fallback career research, assert “AI分析与推断” and assert “实时联网调研” is absent.

- [ ] **Step 3: Correct misleading tests and evidence docs**

Rename or extend the existing `plan generation` P0 test so its name matches its behavior. In acceptance evidence, separate locally observed API mode, platform search trace, knowledge recall trace and plugin call trace. Mark any item without an auditable record as “待补平台证据”.

- [ ] **Step 4: Run the full project gate**

Run: `npm.cmd run verify`

Expected: secret scan, lint, typecheck, 326+ tests, migration smoke and production build all pass.

- [ ] **Step 5: Run all E2E tests**

Run: `npm.cmd run test:e2e`

Expected: all existing and new Chromium tests pass in forced mock mode.

- [ ] **Step 6: Perform browser QA**

Verify desktop and 375px mobile views for: plan generating/pending/confirmed, candidate failure state, report source labels and zero console errors.

- [ ] **Step 7: Commit**

```text
git add e2e docs/tbox/acceptance-evidence.md
git commit -m "test: cover reviewed chat safety and plan flows"
```
