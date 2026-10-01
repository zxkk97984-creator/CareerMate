import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildPlan, roleTemplates, users } from "./seed-data";
import { readReviewCatalog, seedReviewCatalog } from "./review-catalog";

const prisma = new PrismaClient();

// One transaction: an interrupted first launch can be retried without partial demo data.
// Existing accounts are never reset; missing public catalog entries are added.
async function main() {
  const catalog = readReviewCatalog();
  await prisma.$transaction(async (tx) => {
    if (await tx.user.count() > 0) {
      console.log("[review] Existing accounts and records preserved.");
    } else {
      const passwordHash = await bcrypt.hash("careermate123", 10);
      // Match the existing login page's demo-account picker, plus one review account.
      for (const demo of [{ ...users[0], username: "reviewer", displayName: "评委体验账号" }, ...users]) {
        const plan = buildPlan(demo.profile.targetRoleLabel);
        await tx.user.create({
          data: {
            username: demo.username,
            displayName: demo.displayName,
            role: demo.role,
            passwordHash,
            profile: {
              create: {
                ...demo.profile,
                onboardingCompleted: true,
                learningPreference: JSON.stringify(demo.profile.learningPreference),
                interestTags: JSON.stringify(demo.profile.interestTags),
                constraints: JSON.stringify(demo.profile.constraints),
                abilityScores: JSON.stringify(demo.profile.abilityScores),
              },
            },
            plans: demo.role === "user" ? {
              create: {
                targetRole: demo.profile.targetRole,
                years: JSON.stringify(plan.years),
                quarters: JSON.stringify(plan.quarters),
                months: JSON.stringify(plan.months),
                assumptions: JSON.stringify(plan.assumptions),
                riskNotes: JSON.stringify(plan.riskNotes),
              },
            } : undefined,
          },
        });
      }
      console.log("[review] Demo account created: reviewer / careermate123");
    }
    for (const role of roleTemplates) {
      await tx.roleTemplate.upsert({
        where: { roleKey: role.roleKey },
        update: {},
        create: {
          ...role,
          targetAudience: JSON.stringify(role.targetAudience),
          entryRequirements: JSON.stringify(role.entryRequirements),
          coreWork: JSON.stringify(role.coreWork),
          abilityWeights: JSON.stringify(role.abilityWeights),
          threeYearPath: JSON.stringify(role.threeYearPath),
          monthlyTemplates: JSON.stringify(role.monthlyTemplates),
          practiceProjects: JSON.stringify(role.practiceProjects),
          recommendedResources: JSON.stringify(role.recommendedResources),
          simulationScenarios: JSON.stringify(role.simulationScenarios),
          evaluationRules: JSON.stringify(role.evaluationRules),
          sources: JSON.stringify(role.sources),
        },
      });
    }
    const result = await seedReviewCatalog(tx, catalog);
    console.log(`[review] Public catalog ready: ${result.resourcesCreated} learning resources and ${result.jobsCreated} job samples added.`);
  }, { timeout: 30_000 });
}

main().catch(() => {
  console.error("[review] Database initialization failed; existing data has not been reset.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
