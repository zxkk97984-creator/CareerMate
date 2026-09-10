import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { jobSampleDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const { jobId } = await context.params;
  const job = await getPrisma().jobSample.findFirst({
    where: { OR: [{ id: jobId }, { jobId }] },
  });
  if (!job) return fail("NOT_FOUND", "岗位样本不存在", 404);

  return ok({
    job: jobSampleDto(job),
    notice: {
      source: "BOSS 本地样本，仅用于分析与演示",
      verificationStatus: "岗位状态未核验",
      personalInformation: "已移除招聘者姓名、活跃状态等不必要个人信息",
    },
  });
}
