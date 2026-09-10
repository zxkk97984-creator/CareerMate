import { describe, expect, it } from "vitest";
import { sanitizeFreeText, sanitizeJobSampleForContext } from "./context";

describe("job sample context sanitizer", () => {
  it("keeps job requirements but removes recruiter and raw-source fields", () => {
    const context = sanitizeJobSampleForContext({
      jobId: "job-1",
      title: "数据分析师",
      company: "示例公司",
      city: "上海",
      experience: "1-3年",
      education: "本科",
      salaryRaw: "10-15K·13薪",
      salaryMin: 10_000,
      salaryMax: 15_000,
      salaryUnit: "month",
      salaryMonths: 13,
      salaryComparable: false,
      salaryNote: "包含 13 薪，总包与月薪不可直接混算",
      skills: JSON.stringify(["SQL", "Python"]),
      jd: "负责业务数据分析与看板建设",
      sourceBatch: "boss-20260824",
      collectedAt: new Date("2026-08-24T00:00:00.000Z"),
      collectionDateApprox: true,
      verificationStatus: "unverified",
      // @ts-expect-error 明确验证未在源对象声明的不必要字段不会进入输出
      recruiterName: "张三",
      recruiterActive: "刚刚活跃",
      phone: "13800000000",
      sourceFile: ["date/output/a.csv"],
    });

    expect(context).toMatchObject({
      source: "local_boss_sample",
      jobId: "job-1",
      title: "数据分析师",
      skills: ["SQL", "Python"],
      salary: { raw: "10-15K·13薪", comparable: false, months: 13 },
      verificationStatus: "unverified",
    });
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("张三");
    expect(serialized).not.toContain("13800000000");
    expect(serialized).not.toContain("sourceFile");
  });
});

describe("job description free-text sanitizer", () => {
  it("removes contact details while preserving business text", () => {
    const sanitized = sanitizeFreeText(
      "负责数据分析，联系 review@example.com 或 13800000000，微信：data_boss。",
    );

    expect(sanitized).toContain("负责数据分析");
    expect(sanitized).toContain("[已脱敏邮箱]");
    expect(sanitized).toContain("[已脱敏电话]");
    expect(sanitized).toContain("[已脱敏微信]");
    expect(sanitized).not.toContain("review@example.com");
    expect(sanitized).not.toContain("13800000000");
  });
});
