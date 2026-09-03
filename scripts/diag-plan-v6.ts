import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { generatePlanWithTbox, planGenerationNote } from "../src/lib/tbox/plan";
import type { ProfileDto } from "../src/lib/types";

const profile = {
  userId: "diag_plan_v6",
  educationStage: "大学在读",
  major: "数据科学与大数据技术",
  targetRole: "data_analyst",
  targetRoleLabel: "数据分析师",
  weeklyAvailableHours: 10,
  learningPreference: "项目实战",
  experienceSummary: "大二学生，有 SQL/Python 基础，做过课程级数据分析项目",
  interestTags: ["数据分析", "职业规划"],
  constraints: "每周约 10 小时可投入",
  abilityScores: null,
} as unknown as ProfileDto;

const startedAt = Date.now();
async function main() {
  try {
    const generated = await generatePlanWithTbox(profile);
    const note = planGenerationNote(generated.meta);
    const data = generated.data as any;
    console.log(
      JSON.stringify(
        {
          elapsedMs: Date.now() - startedAt,
          meta: generated.meta,
          note,
          dataShape: data
            ? {
                years: data.years?.length ?? 0,
                quarters: data.quarters?.length ?? 0,
                months: data.months?.length ?? 0,
                currentMonth: data.currentMonth?.monthIndex ?? null,
              }
            : null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          elapsedMs: Date.now() - startedAt,
          error: String(error),
          stack: (error as Error)?.stack ?? null,
        },
        null,
        2,
      ),
    );
  }
}

void main();
