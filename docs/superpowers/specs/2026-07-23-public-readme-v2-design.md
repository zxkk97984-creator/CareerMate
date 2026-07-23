# CareerMate Public README V2 Design

Date: 2026-07-23

## Goal

Replace the outdated public README with an accurate, privacy-safe description of the current CareerMate Agentic V2 architecture, local setup, security boundaries, and validation workflow.

The public documentation must help a new contributor understand and run the project without exposing repository-owner information, local machine details, private platform identifiers, credentials, or real user data.

## Files in scope

- `README.md`: rewrite for the current Agentic V2 implementation.
- `AGENTIC_V2_HANDOFF.md`: redact local absolute paths and stale branch-specific instructions while retaining useful architectural context.

No application code, database schema, environment values, user records, or TBox resources will be changed.

## README structure

1. Product positioning
2. Core capabilities
3. Agentic V2 architecture diagram
4. Responsibility boundary between TBox, CareerMate backend, and frontend
5. Structured artifact and confirmation flow
6. Technology stack
7. Privacy-safe quick start
8. Mock and real TBox configuration
9. Useful commands
10. Repository structure
11. Security and privacy rules
12. Testing and documentation index

## Architecture statements

The README will describe these current runtime facts:

- One published TBox Agentic application is the AI decision center.
- CareerMate calls one `agent_id`.
- The backend sends sanitized profile, history, progress, and simulation snapshots through `business_data`.
- Built-in TBox search remains disabled when the Agent uses the configured search MCP.
- Agent output becomes a strict structured candidate.
- The backend validates permissions, schema, and base versions.
- Official profile, evidence, plan, progress, and memory updates require explicit user confirmation.
- The dormant CareerMate business MCP V2 code is retained for future infrastructure but is not required by the active chat path.
- Career support is extensible and is not restricted to the initial seed occupations.

## Privacy rules

Public documentation must not include:

- a repository-owner name or account name;
- an institution or personal competition affiliation;
- an absolute local filesystem path;
- a personal email address or phone number;
- real API keys, tokens, application IDs, agent IDs, dataset IDs, or database values;
- plaintext demo passwords;
- real user profiles, resumes, memories, training records, or conversation excerpts.

Examples use neutral placeholders such as:

- `<repository-url>`
- `<tbox-agent-id>`
- `<tbox-api-key>`

Seed accounts are described only as fictional local test data. Credentials are not listed.

## Handoff redaction

`AGENTIC_V2_HANDOFF.md` will be converted from a machine-specific continuation note into a repository-relative architecture handoff:

- absolute paths become repository-relative paths;
- obsolete commit hashes and worktree instructions are removed;
- stale statements about the previously active token-only transport are removed;
- current snapshot transport and no-business-MCP runtime remain authoritative;
- no account, credential, or private TBox resource identifier is introduced.

## Validation

Before commit and push:

1. Search the changed files for Windows user paths, home-directory paths, account-specific repository URLs, email-like strings, secrets, and plaintext password labels.
2. Run `npm.cmd run secret:scan`.
3. Run `npm.cmd run lint`.
4. Run `npm.cmd run typecheck`.
5. Run `git diff --check`.
6. Review the rendered Markdown structure and Mermaid source.
7. Stage only the README, redacted handoff, and this design document.

The existing unstaged project specification remains untouched.
