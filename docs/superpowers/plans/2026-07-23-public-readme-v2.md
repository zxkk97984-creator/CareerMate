# Public README V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an accurate Agentic V2 README and architecture handoff without exposing repository-owner information, local paths, credentials, platform IDs, or real user data.

**Architecture:** `README.md` becomes the public entry point and explains the active snapshot-based Agentic V2 runtime. `AGENTIC_V2_HANDOFF.md` becomes a repository-relative technical handoff, removing obsolete worktree instructions and machine-specific context while preserving the platform/backend boundary.

**Tech Stack:** Markdown, Mermaid, Git, existing npm quality scripts

---

### Task 1: Rewrite the public README

**Files:**
- Modify: `README.md`
- Reference: `.env.example`
- Reference: `src/lib/chat/agentic-v2-context.ts`
- Reference: `src/lib/agentic-v2/contracts.ts`

- [ ] **Step 1: Replace the personal project introduction**

Use this public-safe positioning:

```markdown
# CareerMate

CareerMate 是一个基于蚂蚁百宝箱 Agentic 应用、Next.js 与 Prisma 构建的长期职业成长伙伴。它将职业探索、能力画像、成长规划、学习路线、职场模拟和持续复盘统一到一个可追踪、可确认、可扩展的产品闭环中。

> 当前仓库包含可本地运行的 Mock 模式，以及对已发布百宝箱 Agentic V2 应用的真实 API 适配。职业类型可扩展，种子职业仅用于演示和回归测试。
```

Do not mention an institution, competition ownership, repository-owner account, or personal background.

- [ ] **Step 2: Add the current Agentic V2 architecture**

Add a Mermaid flowchart containing:

```text
CareerMate frontend
→ CareerMate backend
→ one TBox Agentic V2 agent_id
→ knowledge bases / workflows / skills / specialist agents / search MCP / TBox memory
→ CAREERMATE_ARTIFACT envelope
→ backend schema + permission + base-version validation
→ user confirmation
→ authoritative CareerMate database
```

State explicitly:

- TBox Agentic is the only AI decision center.
- CareerMate backend owns authentication, permissions, versions, confirmation, and official writes.
- The active runtime sends sanitized `profileSnapshot`, `historySnapshot`, and optional `simulationState` through `business_data`.
- `search_engine=false` prevents duplicate search because the Agent uses its configured search MCP.
- `/api/mcp/v2` is retained as dormant future infrastructure and is not required by the active chat path.

- [ ] **Step 3: Document structured candidate safety**

Include the exact envelope name without a real payload:

```text
<CAREERMATE_ARTIFACT>
{...AgentArtifactV1...}
</CAREERMATE_ARTIFACT>
```

Explain the flow:

```text
AI proposal → strict parsing → schema/permission/version validation
→ confirmation card → explicit user decision → official database projection
```

State that untagged JSON, malformed envelopes, or failed validation may be shown as readable text but cannot write official data.

- [ ] **Step 4: Update quick start without repository-owner data**

Use:

```bash
git clone <repository-url>
cd CareerMate
npm.cmd install
copy .env.example .env.local
npm.cmd run prisma:generate
npm.cmd run db:migrate:deploy
npm.cmd run seed
npm.cmd run dev
```

Describe seed users as fictional local test data. Do not list account names, display names, or plaintext passwords.

- [ ] **Step 5: Update real TBox configuration**

Document only placeholder values:

```env
TBOX_MODE="api"
TBOX_API_KEY="<tbox-api-key>"
TBOX_AGENT_ID="<tbox-agent-id>"
TBOX_AGENT_VERSION="<validated-agent-version>"
CAREERMATE_AGENTIC_V2="true"
TBOX_CONTEXT_TRANSPORT="business_data"
TBOX_HISTORY_MODE="provider"
STATEFUL_CHAT_TURNS="true"
TBOX_SEARCH_ENGINE="false"
```

Explain that the API key remains server-only and `.env.local` must never be committed.

- [ ] **Step 6: Update repository structure and documentation links**

Add:

```text
src/agentic-v2/              # Knowledge-base assets, Skills, workflows and evaluation cases
src/lib/agentic-v2/          # Runtime contracts, envelope parsing and candidate lifecycle
src/lib/chat/                # Sanitized snapshots, SSE and conversation state
src/app/api/agentic-v2/      # Candidate query and confirmation endpoints
```

Link only to repository-relative documentation that exists. Do not link to a local filesystem or a private external document.

### Task 2: Redact and modernize the Agentic V2 handoff

**Files:**
- Modify: `AGENTIC_V2_HANDOFF.md`
- Reference: `docs/superpowers/plans/2026-07-23-agentic-v2-no-business-mcp.md`

- [ ] **Step 1: Replace machine-specific continuation instructions**

Remove:

- absolute Windows paths;
- worktree paths;
- local user directory names;
- branch-specific continuation commands;
- obsolete commit hashes;
- model-launch prompts containing local paths;
- statements that token-only `business_data` is the active runtime.

- [ ] **Step 2: Keep a repository-relative architecture handoff**

Use these sections:

```text
1. Current runtime
2. Responsibility boundaries
3. Active request and response contracts
4. TBox V2 resource topology
5. Candidate confirmation lifecycle
6. Long-term memory boundary
7. Dormant future infrastructure
8. Local validation and release checklist
```

All file references must be repository relative. Platform examples use neutral resource names and placeholders only.

- [ ] **Step 3: Resolve internal contradictions**

The handoff must say:

- snapshot transport is active;
- signed context-token code and `/api/mcp/v2` are dormant;
- one V2 `agent_id` is called by the backend;
- Quark search MCP is the intended Agent-side web channel;
- CareerMate database remains authoritative;
- platform memory stores only low-sensitivity preferences;
- no claim is made that an unverified TBox resource is already published.

### Task 3: Privacy and documentation validation

**Files:**
- Verify: `README.md`
- Verify: `AGENTIC_V2_HANDOFF.md`
- Verify: `docs/superpowers/specs/2026-07-23-public-readme-v2-design.md`
- Verify: `docs/superpowers/plans/2026-07-23-public-readme-v2.md`

- [ ] **Step 1: Scan for personal and machine-specific data**

Run:

```bat
git grep -n -I -E "C:\\\\Users\\\\|/Users/|/home/|file://|https://github.com/[^/<]+/" -- README.md AGENTIC_V2_HANDOFF.md
```

Expected: no matches.

Also manually review the design and implementation-plan files, then confirm there are no names, emails, phone numbers, credentials, real platform IDs, real dataset IDs, or real user excerpts. The implementation plan is reviewed separately because it contains the privacy-scan pattern as documentation.

- [ ] **Step 2: Run documentation and project checks**

Run:

```bat
npm.cmd run secret:scan
npm.cmd run lint
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Confirm unrelated user changes remain unstaged**

Run:

```bat
git status --short
```

Expected: the pre-existing project specification remains modified but unstaged. Only the README, handoff, design, and implementation plan belong to this documentation change.

- [ ] **Step 4: Commit only the intended documentation**

Run:

```bat
git add README.md AGENTIC_V2_HANDOFF.md docs/superpowers/specs/2026-07-23-public-readme-v2-design.md docs/superpowers/plans/2026-07-23-public-readme-v2.md
git diff --cached --check
git commit -m "docs: publish privacy-safe Agentic V2 README"
```

- [ ] **Step 5: Push the validated branch**

Run:

```bat
git push origin Xiaoxiao/careermate-p0-init
```

Expected: the remote branch advances to the documentation commit without staging or committing the local project specification.
