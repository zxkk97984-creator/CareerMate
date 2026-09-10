import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const fixture = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: null as any, generate: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ getPrisma: () => fixture.db }));
vi.mock('@/lib/auth', () => ({ requireCurrentUser: async () => fixture.user }));
vi.mock('@/lib/simulation/generation', () => ({ generateSimulationTurn: fixture.generate, generateSimulationReport: fixture.report }));
import { openTrainingConversation } from './chat-session';
import { streamTrainingAnswer } from './chat-stream';
import { completeSimulation } from './complete-service';
import { POST as create } from '@/app/api/simulations/route';
let directory: string;
const meta = { requestedMode: 'api', actualMode: 'api', degraded: false, fallbackReason: null, source: 'test' };
beforeAll(async () => {
 directory = mkdtempSync(join(tmpdir(), 'training-chat-'));
 writeFileSync(join(directory, 'test.db'), '');
 const url = `file:${join(directory, 'test.db')}`;
 execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url, NODE_ENV: "development" }, stdio: 'pipe' });
 fixture.db = new PrismaClient({ datasources: { db: { url } } });
 fixture.user = await fixture.db.user.create({ data: { username: 'training-test', displayName: '测试', passwordHash: 'not-a-real-login', profile: { create: { targetRole: 'data_analyst', targetRoleLabel: '数据分析师' } } }, include: { profile: true } });
 fixture.generate.mockResolvedValue({ data: { text: '请说明你会如何验证这一结果。', warnings: [], conversationId: 'remote-test' }, meta });
}, 60000);
afterAll(async () => { await fixture.db?.$disconnect(); if (directory) rmSync(directory, { recursive: true, force: true }); });
async function newSession() {
 const session = await fixture.db.simulationSession.create({ data: { userId: fixture.user.id, scenarioKey: 'cross_role_communication', scenarioTitle: '跨岗位沟通', status: 'active', transcript: JSON.stringify([{ role: 'assistant', content: '请介绍你的目标。' }]), requestedMode: 'api', actualMode: 'api' } });
 const conversationId = (await openTrainingConversation(fixture.user.id, session.id))!;
 return { session, conversationId };
}
describe('independent training conversations', () => {
 it('creates once, restores deleted chat and rejects another owner', async () => {
  const { session, conversationId } = await newSession();
  expect(await openTrainingConversation('other-user', session.id)).toBeNull();
  expect(await openTrainingConversation(fixture.user.id, session.id)).toBe(conversationId);
  expect(await fixture.db.chatMessage.count({ where: { conversationId } })).toBe(1);
  await fixture.db.chatConversation.update({ where: { id: conversationId }, data: { status: 'deleted' } });
  expect(await openTrainingConversation(fixture.user.id, session.id)).toBe(conversationId);
  expect((await fixture.db.chatConversation.findUniqueOrThrow({ where: { id: conversationId } })).status).toBe('active');
 });
 it('persists a turn and replays old requests without advancing or invoking AI twice', async () => {
  const { session, conversationId } = await newSession();
  const before = fixture.generate.mock.calls.length;
  const send = (id: string) => streamTrainingAnswer(fixture.user, conversationId, session.id, '我会先确认需求和验收标准，再安排任务。', id).text();
  expect(await send('request-0001')).toContain('event: done');
  expect(await send('request-0002')).toContain('event: done');
  expect(await send('request-0001')).toContain('event: done');
  expect(fixture.generate.mock.calls.length - before).toBe(2);
  expect((await fixture.db.simulationSession.findUniqueOrThrow({ where: { id: session.id } })).turnCount).toBe(2);
  expect(await fixture.db.chatMessage.count({ where: { conversationId } })).toBe(5);
 });
 it('does not advance the training on API failure, and releases the chat lock', async () => {
  const { session, conversationId } = await newSession();
  fixture.generate.mockResolvedValueOnce({ data: { text: '', warnings: [] }, meta: { ...meta, degraded: true } });
  expect(await streamTrainingAnswer(fixture.user, conversationId, session.id, '我会先确认需求和验收标准。', 'request-failed').text()).toContain('event: error');
  expect((await fixture.db.simulationSession.findUniqueOrThrow({ where: { id: session.id } })).turnCount).toBe(0);
  expect((await fixture.db.chatConversation.findUniqueOrThrow({ where: { id: conversationId } })).activeTurnId).toBeNull();
 });
 it('creates a linked chat idempotently from the public creation API', async () => {
  const request = () => new Request('http://localhost/api/simulations', { method: 'POST', body: JSON.stringify({ scenarioType: 'cross_role_communication', createConversation: true, requestId: 'create-request-1' }) });
  const first = await (await create(request())).json();
  const second = await (await create(request())).json();
  expect(first.ok).toBe(true); expect(second.data.conversationId).toBe(first.data.conversationId);
  expect(await fixture.db.simulationSession.count({ where: { userId: fixture.user.id, creationRequestId: 'create-request-1' } })).toBe(1);
 });
 it('requires three turns and persists a single report reference on completion', async () => {
  const { session, conversationId } = await newSession();
  const req = () => new Request('http://localhost/complete', { method: 'POST' });
  expect((await completeSimulation(req(), fixture.user, session.id)).status).toBe(409);
  for (let n = 0; n < 3; n++) await streamTrainingAnswer(fixture.user, conversationId, session.id, '我会先确认需求和验收标准，再安排任务。', `completion-turn-${n}`).text();
  fixture.report.mockResolvedValue({ data: { structured: { type: 'simulation_report', scenarioKey: 'cross_role_communication', score: 84, strengths: ['目标清晰'], improvements: ['补充量化指标'], evidence: ['确认需求和验收标准'], abilityImpact: { communication: 3 }, candidateUpdates: [] }, warnings: [] }, meta });
  expect((await completeSimulation(req(), fixture.user, session.id)).status).toBe(200);
  expect((await completeSimulation(req(), fixture.user, session.id)).status).toBe(200);
  expect(await fixture.db.chatMessage.count({ where: { conversationId, clientRequestId: `simulation-report:${session.id}` } })).toBe(1);
 });
});

it('serializes simultaneous answers and prevents scoring during an active answer', async () => {
 const { session, conversationId } = await newSession();
 let release!: (value: unknown) => void;
 let entered!: () => void;
 const started = new Promise<void>(resolve => { entered = resolve; });
 fixture.generate.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
 const first = streamTrainingAnswer(fixture.user, conversationId, session.id, '我会先确认验收标准并沟通风险。', 'simultaneous-first').text();
 await started;
 const second = await streamTrainingAnswer(fixture.user, conversationId, session.id, '我会先确认验收标准并沟通风险。', 'simultaneous-second').text();
 expect(second).toContain('event: error');
 expect((await completeSimulation(new Request('http://localhost/complete', { method: 'POST' }), fixture.user, session.id)).status).toBe(409);
 release({ data: { text: '请补充具体衡量指标。', warnings: [] }, meta });
 expect(await first).toContain('event: done');
 expect((await fixture.db.simulationSession.findUniqueOrThrow({ where: { id: session.id } })).turnCount).toBe(1);
});
