# Onboarding Short Answer Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly persist a bare major answer such as “数据科学与大数据技术” and self-heal active onboarding drafts from their existing transcript.

**Architecture:** Keep the Zod-validated server draft as the only source of truth. Add a context-aware turn extractor that accepts a bare answer only when `major` is the next missing field, then rebuild draft facts by replaying stored user turns before processing the current message.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Prisma/SQLite, Vitest

---

## File Structure

- Modify `src/lib/onboarding.ts`: own context-aware short-answer validation, extraction, and transcript replay.
- Modify `src/lib/onboarding.test.ts`: prove the user-reported sequence and invalid-answer safeguards.
- Modify `src/app/api/onboarding/chat/route.ts`: rebuild the draft before processing the new turn and send the repaired draft to Tbox.
- Modify `src/app/api/onboarding/chat/route.test.ts`: prove API-level self-healing and prompt context.

### Task 1: Context-aware major extraction

**Files:**
- Modify: `src/lib/onboarding.test.ts`
- Modify: `src/lib/onboarding.ts`

- [ ] **Step 1: Write failing domain tests**

Add tests that express the desired public API:

```ts
it("uses a bare short answer for the currently requested major", () => {
  const previous = { educationStage: "sophomore" };
  expect(extractOnboardingDraftForTurn("数据科学与大数据技术", previous)).toEqual({
    major: "数据科学与大数据技术",
  });
});

it.each(["不知道", "没有", "AI产品经理", "每周 5 小时"])(
  "does not treat %s as a bare major",
  (message) => {
    const previous = { educationStage: "sophomore" };
    expect(extractOnboardingDraftForTurn(message, previous)).not.toHaveProperty("major");
  },
);

it("replays the reported onboarding sequence into a complete partial draft", () => {
  const transcript = [
    { role: "user" as const, content: "我是本科大二的学生" },
    { role: "assistant" as const, content: "你目前主修什么专业？" },
    { role: "user" as const, content: "数据科学与大数据技术" },
    { role: "assistant" as const, content: "你目前有比较明确的目标岗位吗？" },
    { role: "user" as const, content: "AI产品经理" },
  ];
  expect(rebuildOnboardingDraft(transcript, {})).toMatchObject({
    educationStage: "sophomore",
    major: "数据科学与大数据技术",
    targetRole: "ai_product_manager",
  });
});
```

- [ ] **Step 2: Run the domain tests and verify RED**

Run:

```bash
npm.cmd test -- src/lib/onboarding.test.ts
```

Expected: FAIL because `extractOnboardingDraftForTurn` and `rebuildOnboardingDraft` are not exported.

- [ ] **Step 3: Implement the minimal context-aware extractor**

In `src/lib/onboarding.ts`, add:

```ts
type OnboardingTranscriptTurn = { role: "user" | "assistant"; content: string };

function bareMajorAnswer(message: string) {
  const value = message.trim().replace(/专业$/u, "").trim();
  if (value.length < 2 || value.length > 40) return undefined;
  if (/[？?！!。；;\n\r]/u.test(value)) return undefined;
  if (/(?:不知道|不清楚|没有|暂无|随便|还没想好)/u.test(value)) return undefined;
  return value;
}

export function extractOnboardingDraftForTurn(message: string, previous: OnboardingDraft) {
  const explicit = extractOnboardingDraft(message);
  if (Object.keys(explicit).length > 0 || missingOnboardingGroups(previous)[0] !== "major") {
    return explicit;
  }
  const major = bareMajorAnswer(message);
  return onboardingDraftSchema.parse(major ? { major } : {});
}

export function rebuildOnboardingDraft(
  transcript: OnboardingTranscriptTurn[],
  storedDraft: OnboardingDraft,
) {
  const replayed = transcript.reduce((draft, turn) => {
    if (turn.role !== "user") return draft;
    return mergeOnboardingDraft(draft, extractOnboardingDraftForTurn(turn.content, draft));
  }, {} as OnboardingDraft);
  return mergeOnboardingDraft(replayed, storedDraft);
}
```

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run:

```bash
npm.cmd test -- src/lib/onboarding.test.ts
```

Expected: all onboarding domain tests pass.

- [ ] **Step 5: Commit the domain change**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts
git commit -m "fix:onboarding-short-major-answer"
```

### Task 2: API transcript self-healing

**Files:**
- Modify: `src/app/api/onboarding/chat/route.test.ts`
- Modify: `src/app/api/onboarding/chat/route.ts`

- [ ] **Step 1: Write the failing API regression test**

Create an active conversation whose stored draft lacks `major`, while its transcript contains the user-reported sequence. Send `AI产品经理` as the next message and assert:

```ts
expect(payload.data.draft).toMatchObject({
  educationStage: "sophomore",
  major: "数据科学与大数据技术",
  targetRole: "ai_product_manager",
});
expect(mocks.chat.mock.calls[0][0].context.draft.major).toBe("数据科学与大数据技术");
expect(payload.data.assistantMessage).not.toContain("专业");
```

Configure the mocked API answer as “接下来请告诉我每周可投入多少小时。” so the assertion checks the repaired context is used.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npm.cmd test -- src/app/api/onboarding/chat/route.test.ts
```

Expected: FAIL because the route only trusts the incomplete stored draft.

- [ ] **Step 3: Rebuild the draft before current-turn extraction**

Update imports in `route.ts` to include `extractOnboardingDraftForTurn` and `rebuildOnboardingDraft`. Parse the transcript before extraction, then replace the current flow with:

```ts
const transcript = parseOnboardingTranscript(conversation.transcript);
const storedDraft = safeStoredDraft(conversation.draft);
const previousDraft = rebuildOnboardingDraft(transcript, storedDraft);
const extracted = extractOnboardingDraftForTurn(parsed.data.message, previousDraft);
const draft = mergeOnboardingDraft(previousDraft, extracted);
```

Reuse the same `transcript` variable when appending the new user and assistant turns.

- [ ] **Step 4: Run route and domain tests and verify GREEN**

Run:

```bash
npm.cmd test -- src/lib/onboarding.test.ts src/app/api/onboarding/chat/route.test.ts
```

Expected: both test files pass with no failures.

- [ ] **Step 5: Commit the API repair**

```bash
git add src/app/api/onboarding/chat/route.ts src/app/api/onboarding/chat/route.test.ts
git commit -m "fix:self-heal-onboarding-draft"
```

### Task 3: Full verification and live regression

**Files:**
- Verify only; no expected source changes.

- [ ] **Step 1: Run the complete quality gate**

```bash
npm.cmd run verify
```

Expected: secret scan, lint, typecheck, all Vitest tests, migration smoke test, and production build pass.

- [ ] **Step 2: Run E2E**

```bash
npm.cmd run test:e2e
```

Expected: all Playwright flows pass.

- [ ] **Step 3: Verify the existing active conversation self-heals**

Start the development server, continue the affected onboarding conversation once, and verify the returned draft contains `major: "数据科学与大数据技术"` and the next question asks for weekly available hours rather than the major.

- [ ] **Step 4: Check repository cleanliness**

```bash
git status --short
git diff --check
```

Expected: no uncommitted changes and no whitespace errors.
