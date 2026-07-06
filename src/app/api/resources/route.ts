import { ok } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleKey = url.searchParams.get("roleKey") ?? undefined;
  const abilityKey = url.searchParams.get("abilityKey") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  const items = await getPrisma().resourceItem.findMany({
    where: { roleKey, abilityKey, type },
    orderBy: [{ roleKey: "asc" }, { stage: "asc" }],
  });

  return ok({ items });
}
