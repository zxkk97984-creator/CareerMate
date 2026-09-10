/** Only structured failures from a workflow are treated as workflow diagnostics. */
export function workflowFailureCode(toolType: string | undefined, summary: string | undefined): string | null {
  if (!summary || !["subflow", "workflow"].includes(toolType ?? "")) return null;
  try {
    const raw = JSON.parse(summary);
    const artifact = raw?.artifact ?? raw;
    if (artifact?.status !== "error") return null;
    const code = artifact?.data?.code;
    return ["INVALID_WORKFLOW_INPUT", "INVALID_JSON", "INVALID_ARTIFACT_SCHEMA", "WORKFLOW_OUTPUT_MISSING"].includes(code) ? code : "WORKFLOW_FAILED";
  } catch { return null; }
}
