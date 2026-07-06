import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { userDto } from "@/lib/dto";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "注册参数不合法", 400, parsed.error.flatten());

  const exists = await getPrisma().user.findUnique({ where: { username: parsed.data.username } });
  if (exists) return fail("VALIDATION_ERROR", "用户名已存在", 400);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await getPrisma().user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash,
      profile: {
        create: {
          educationStage: "junior",
          major: "",
          targetRole: "ai_product_manager",
          targetRoleLabel: "AI 产品经理",
          weeklyAvailableHours: 5,
          learningPreference: toJson(["project", "practice"]),
          experienceSummary: "新用户，等待 CareerMate 完成画像采集。",
          interestTags: toJson(["AI 工具", "职业探索"]),
          constraints: toJson([]),
          abilityScores: toJson({
            aiTooling: 45,
            roleFoundation: 35,
            dataAnalysis: 35,
            businessProduct: 40,
            communication: 45,
            projectPractice: 30,
          }),
        },
      },
    },
  });

  await setSession(user.id);
  return ok({ user: userDto(user) });
}
