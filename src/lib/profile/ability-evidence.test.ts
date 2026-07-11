import { describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

const { createAbilityEvidenceService } = await import("./ability-evidence");

describe("AbilityEvidenceService", () => {
  it("从对话片段创建待确认能力证据", async () => {
    const mockPrisma = {
      abilityEvidence: { create: vi.fn() },
    };
    mockPrisma.abilityEvidence.create.mockResolvedValue({
      id: "ev-new",
      userId: "user-1",
      abilityKey: "communication",
      summary: "用户在对话中清晰表达了职业规划思路",
      sourceType: "chat",
      sourceRef: "conv-1",
      confidence: 0.78,
      status: "pending",
      observedAt: new Date("2026-07-12T10:00:00Z"),
    });
    (getPrisma as any).mockReturnValue(mockPrisma);

    const svc = createAbilityEvidenceService();
    const result = await svc.createEvidence({
      userId: "user-1",
      abilityKey: "communication",
      summary: "用户在对话中清晰表达了职业规划思路",
      sourceType: "chat",
      sourceRef: "conv-1",
      confidence: 0.78,
    });

    expect(result.status).toBe("pending");
    expect(result.abilityKey).toBe("communication");
    expect(result.summary).toBe("用户在对话中清晰表达了职业规划思路");
    expect(result.confidence).toBe(0.78);
  });

  it("证据创建时 confidence 限定 0–1", async () => {
    const mockPrisma = {
      abilityEvidence: { create: vi.fn() },
    };
    (getPrisma as any).mockReturnValue(mockPrisma);
    const svc = createAbilityEvidenceService();

    await expect(
      svc.createEvidence({
        userId: "user-1",
        abilityKey: "communication",
        summary: "测试",
        sourceType: "chat",
        sourceRef: null,
        confidence: 1.5,
      })
    ).rejects.toThrow("置信度必须在0到1之间");
  });

  it("无效能力维度拒绝创建", async () => {
    const mockPrisma = {
      abilityEvidence: { create: vi.fn() },
    };
    (getPrisma as any).mockReturnValue(mockPrisma);
    const svc = createAbilityEvidenceService();

    await expect(
      svc.createEvidence({
        userId: "user-1",
        abilityKey: "invalidKey",
        summary: "测试",
        sourceType: "chat",
        sourceRef: null,
        confidence: 0.5,
      })
    ).rejects.toThrow("无效的能力维度");
  });

  it("空摘要拒绝创建", async () => {
    const mockPrisma = {
      abilityEvidence: { create: vi.fn() },
    };
    (getPrisma as any).mockReturnValue(mockPrisma);
    const svc = createAbilityEvidenceService();

    await expect(
      svc.createEvidence({
        userId: "user-1",
        abilityKey: "communication",
        summary: "",
        sourceType: "chat",
        sourceRef: null,
        confidence: 0.5,
      })
    ).rejects.toThrow("摘要不能为空");
  });
});
