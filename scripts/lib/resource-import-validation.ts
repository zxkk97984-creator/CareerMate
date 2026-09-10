import { isAllowedResourceSource } from "@/lib/resources";
import { abilityKeys, resourceTypes } from "@/lib/types";

const ALLOWED_VERIFICATION = new Set(["verified", "unverified", "stale"]);
const ALLOWED_ABILITY = new Set<string>(abilityKeys);
const ALLOWED_TYPES = new Set<string>(resourceTypes);

function list(value: string | undefined): string[] {
  return (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
}

/**
 * 校验一条学习资源。整批校验必须先于任何数据库写入。
 */
export function validateResourceRecord(
  record: Record<string, string>,
  lineNumber: number,
  seen: Set<string>,
): string[] {
  const errors: string[] = [];
  const externalKey = record.externalKey?.trim();
  if (!externalKey) return [`第 ${lineNumber} 行缺少 externalKey`];
  if (seen.has(externalKey)) return [`第 ${lineNumber} 行 externalKey 重复：${externalKey}`];
  seen.add(externalKey);

  if (!record.title?.trim()) errors.push(`${externalKey}: 缺少标题`);
  if (!ALLOWED_TYPES.has(record.type)) errors.push(`${externalKey}: 资源类型无效`);
  if (!ALLOWED_ABILITY.has(record.abilityKey)) errors.push(`${externalKey}: abilityKey 无效`);
  if (!/^[a-z0-9_:-]+$/i.test(record.roleKey ?? "")) errors.push(`${externalKey}: roleKey 无效`);
  if (!isAllowedResourceSource(record.source ?? "")) errors.push(`${externalKey}: 来源未通过安全规则`);
  if (!ALLOWED_VERIFICATION.has(record.verificationStatus ?? "")) errors.push(`${externalKey}: verificationStatus 无效`);

  if (record.estimatedHours?.trim()) {
    const hours = Number(record.estimatedHours);
    if (!Number.isFinite(hours) || hours <= 0) errors.push(`${externalKey}: estimatedHours 必须是正数`);
  }

  if (record.url?.trim()) {
    try {
      const url = new URL(record.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        errors.push(`${externalKey}: URL 必须使用 http/https`);
      }
    } catch {
      errors.push(`${externalKey}: URL 无效`);
    }
  }
  if (record.verificationStatus === "verified" && !record.url?.trim()) {
    errors.push(`${externalKey}: verified 资源必须有可追溯 URL`);
  }

  // 无外链资源必须有完整实践说明，不能只留一个标题占位。
  if (!record.url?.trim()) {
    if (!record.detail?.trim() && !record.description?.trim()) {
      errors.push(`${externalKey}: 自建实践缺少说明`);
    }
    if (list(record.steps).length === 0) errors.push(`${externalKey}: 自建实践缺少步骤`);
    if (list(record.deliverables).length === 0) errors.push(`${externalKey}: 自建实践缺少交付物`);
    if (list(record.acceptanceCriteria).length === 0) errors.push(`${externalKey}: 自建实践缺少验收标准`);
  }

  return errors;
}

export function resourceList(value: string | undefined): string[] {
  return list(value);
}
