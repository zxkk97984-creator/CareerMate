/** Grid and states reference K12-Learning-platform/frontend/src/features/companion. */
export const companionFrames = {
  idle: { row: 0, frames: 6, label: "随时可以聊聊" },
  listening: { row: 6, frames: 6, label: "正在听你说" },
  thinking: { row: 8, frames: 6, label: "正在思考" },
  speaking: { row: 3, frames: 4, label: "正在回复" },
  confused: { row: 5, frames: 8, label: "我们再试一次" },
} as const;
export type CompanionState = keyof typeof companionFrames;
export function companionState(phase: string, draft: string, error: string | null): CompanionState {
  if (phase === "waiting") return "thinking";
  if (phase === "speaking") return "speaking";
  if (error) return "confused";
  return draft ? "listening" : "idle";
}
