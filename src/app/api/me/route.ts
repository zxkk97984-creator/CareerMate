import { fail, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { profileDto, userDto } from "@/lib/dto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  return ok({
    user: userDto(user),
    profile: user.profile ? profileDto(user.profile) : null,
  });
}
