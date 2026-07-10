const deniedSourcePattern = /(?:未授权|爬取|抓取|来源不明|转载不明)/i;
const allowedSourcePrefixes = ["人工整理", "自建", "官方", "授权", "公开来源"];
const explicitPublicSources = new Set(["公开资源", "公共领域", "Open Source", "开放数据"]);

export function isAllowedResourceSource(source: string) {
  const normalized = source.trim();
  if (!normalized || deniedSourcePattern.test(normalized)) return false;
  return allowedSourcePrefixes.some((prefix) => normalized.startsWith(prefix)) || explicitPublicSources.has(normalized);
}

interface FilterableResource {
  roleKey: string;
  abilityKey: string;
  type: string;
}

export function filterResources<T extends FilterableResource>(
  items: T[],
  filters: { roleKey: string | "all"; abilityKey: string | "all"; type: string | "all" },
) {
  return items.filter((item) =>
    (filters.roleKey === "all" || item.roleKey === filters.roleKey)
    && (filters.abilityKey === "all" || item.abilityKey === filters.abilityKey)
    && (filters.type === "all" || item.type === filters.type),
  );
}
