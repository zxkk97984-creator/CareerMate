/** Compatibility warnings remain available for diagnosis, without implying chat failure. */
export const CHAT_WARNING_PART_CODES = new Set(["WARNINGS", "AGENT_RESPONSE_WARNINGS"]);
const INFORMATIONAL_CODES = new Set([
  "UNKNOWN_EVENT", "NORMALIZED_ARTIFACT_SCHEMA_VERSION", "DUPLICATE_RESPONSE",
  "REPAIRED_ARTIFACT_JSON", "NORMALIZED_SIMULATION_SCENARIO",
]);
export function describeChatWarnings(codes: string[]) {
  const unique = [...new Set(codes.flatMap(code => code.split(/;\s*/)).filter(Boolean))];
  const actionable = unique.some(code => !INFORMATIONAL_CODES.has(code));
  return {
    codes: unique,
    actionable,
    message: unique.includes("INVALID_WORKFLOW_INPUT")
      ? "部分工作流未通过输入校验，本次未生成对应的有效业务结果。请稍后重试；若持续出现，需要检查工作流配置。"
      : unique.includes("WORKFLOW_OUTPUT_MISSING") || unique.includes("INVALID_JSON")
        ? "部分工作流未返回可用的结构化结果，本次业务处理未完成，需要检查工作流输出配置。"
      : unique.some(code => /INVALID_ARTIFACT|INVALID_JSON|ARTIFACT_ENVELOPE/.test(code))
        ? "回复已完成，但部分结构化结果未通过校验，未保存为有效业务结果。"
        : actionable ? "回复已完成，但部分处理存在限制，请结合正文说明使用。" : "回复已完成，附有兼容性诊断信息。",
  };
}

/** Filter only recognizable legacy tool output; never invent a source for it. */
export function isInternalToolCitation(title: string): boolean {
  return /^\s*(?:\{\s*"(?:artifact|schemaVersion|code|summary)"|\[Skill:|stdout\s*:|stderr\s*:|Plan created successfully\.|Subtask \d+\s*\(|子应用执行完成|\*{0,2}连通性确认\s*[:：])/i.test(title);
}
