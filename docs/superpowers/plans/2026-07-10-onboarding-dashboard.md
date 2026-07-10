# Conversational Onboarding and Weighted Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, persisted conversational onboarding and expose weighted career-match dashboard data without changing the database schema.

**Architecture:** Keep extraction, merge, completeness, validation, and question selection in a pure `src/lib/onboarding.ts` domain module. Thin authenticated route handlers own persistence and transactions, while `/api/me` composes weighted match and recent progress data for the existing workspace client.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Prisma/SQLite, React, Vitest.

---

### Task 1: Onboarding domain

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/onboarding.test.ts`

- [ ] Write tests for validation, deterministic extraction, merge preservation, seven-group completeness, candidate selection, and next-question ordering.
- [ ] Run `npm.cmd test -- src/lib/onboarding.test.ts` and confirm the missing-module failure.
- [ ] Implement the typed Zod draft schema and pure domain helpers.
- [ ] Re-run the focused tests and refactor only while green.

### Task 2: Chat persistence route

**Files:**
- Create: `src/app/api/onboarding/chat/route.ts`
- Test: `src/app/api/onboarding/chat/route.test.ts`

- [ ] Write route tests for authentication, invalid input, ownership/status errors, transcript persistence, safe adapter context, deterministic fallback, candidate, and AI metadata.
- [ ] Run the focused test and confirm the missing-route failure.
- [ ] Implement the route with the existing unified Tbox adapter and no profile writes.
- [ ] Re-run the focused tests.

### Task 3: Completion transaction

**Files:**
- Create: `src/app/api/onboarding/complete/route.ts`
- Test: `src/app/api/onboarding/complete/route.test.ts`

- [ ] Write tests for ownership, active/completed status, the 0.8 threshold, server-stored draft validation, transactional profile/log/conversation writes, and idempotent success.
- [ ] Run the focused test and confirm the missing-route failure.
- [ ] Implement server-authoritative completion and idempotency.
- [ ] Re-run the focused tests.

### Task 4: Routing and auth next path

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/dto.ts`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/components/login-form.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/workspace-page.tsx`
- Test: `src/lib/onboarding-routing.test.ts`

- [ ] Write tests proving registration returns `/onboarding`, login returns the profile-aware path, and routing resolves incomplete users to onboarding.
- [ ] Run the focused test and confirm the expected failures.
- [ ] Add a pure route resolver and surface `onboardingCompleted` in profile DTOs and auth responses.
- [ ] Use the returned `nextPath` in the login form and enforce it on protected pages.
- [ ] Re-run the focused tests.

### Task 5: Weighted `/api/me`

**Files:**
- Modify: `src/app/api/me/route.ts`
- Test: `src/app/api/me/route.test.ts`

- [ ] Write a test proving asymmetric ability scores produce `calculateMatch`'s weighted result rather than the arithmetic average, and that eight recent logs/runtime mode are returned.
- [ ] Run the focused test and confirm failure.
- [ ] Compose `calculateMatch`, recent logs, and requested runtime mode in `/api/me` while preserving existing fields.
- [ ] Re-run the focused test.

### Task 6: Chat onboarding and dashboard UI

**Files:**
- Modify: `src/components/workspace.tsx`

- [ ] Add client contract tests or typecheck-targeted assertions before changing component behavior.
- [ ] Replace the onboarding form with transcript/input, completeness, structured summary, and an 80%-gated confirm action.
- [ ] Render weighted score/explanation/weak abilities, six-dimension radar, tasks, pending candidates, and recent logs.
- [ ] Display requested runtime mode and update actual/degraded status from onboarding AI responses.

### Task 7: Verify and commit

**Files:** all changed files.

- [ ] Run all focused tests.
- [ ] Run `npm.cmd run verify` and inspect the complete output.
- [ ] Review `git diff --check`, `git diff`, and `git status --short` for scope and regressions.
- [ ] Commit the cohesive implementation with a descriptive message.
