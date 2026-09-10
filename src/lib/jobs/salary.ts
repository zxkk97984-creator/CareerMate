/**
 * 岗位薪资解析。
 *
 * 目标不是把所有写法强行折算成同一个数字，而是保留单位和多薪制信息：
 * - 能可靠识别的月/日/时/年薪才标记 comparable；
 * - 13薪、14薪、面议、未标明月/年薪、以上/以下等值不进入统一可比统计；
 * - 原始字符串始终保留，供页面解释。
 */

export type SalaryUnit = "month" | "day" | "hour" | "year";

export interface ParsedSalary {
  raw: string;
  min: number | null;
  max: number | null;
  unit: SalaryUnit | null;
  months: number | null;
  comparable: boolean;
  note: string;
}

const UNIT_LABELS: Record<SalaryUnit, string> = {
  month: "月",
  day: "日",
  hour: "小时",
  year: "年",
};

function detectUnit(text: string): SalaryUnit | null {
  if (/年薪|万元?\s*\/\s*年|w\s*\/\s*年/i.test(text)) return "year";
  if (/日薪|元?\s*\/\s*天|每天/.test(text)) return "day";
  if (/时薪|元?\s*\/\s*(?:小时|时)|每小时/.test(text)) return "hour";
  if (/月薪|元?\s*\/\s*月|每月/.test(text)) return "month";
  // 只有 K/千 而没有“年”时，招聘场景通常指月薪；没有单位的“万”不猜测。
  if (/[kK]|千/.test(text)) return "month";
  return null;
}

function unitForToken(token: string | undefined, fallback: SalaryUnit | null): SalaryUnit | null {
  if (!token) return fallback;
  if (/万|w/i.test(token)) return "year";
  if (/千|k/i.test(token)) return "month";
  return fallback;
}

function tokenFactor(token: string | undefined, unit: SalaryUnit | null): number {
  if (token && /万|w/i.test(token)) return 10_000;
  if (token && /千|k/i.test(token)) return 1_000;
  // 显式“元”时按元处理；只有缺少 token 且单位是年时才按“万元”解释。
  if (token && /元/.test(token)) return 1;
  return unit === "year" ? 10_000 : 1;
}

export function parseSalary(raw: string): ParsedSalary {
  const original = raw.trim();
  if (!original || /面议|薪资面议|待遇面议/.test(original)) {
    return {
      raw: original,
      min: null,
      max: null,
      unit: null,
      months: null,
      comparable: false,
      note: original ? "薪资面议或未提供具体数字" : "薪资字段为空",
    };
  }

  const monthsMatch = original.match(/[·・]?\s*(\d{1,2})\s*薪/);
  const months = monthsMatch ? Number(monthsMatch[1]) : null;
  const withoutMonths = original.replace(/[·・]?\s*\d{1,2}\s*薪/g, "");
  const unit = detectUnit(withoutMonths);
  const numbers = [...withoutMonths.matchAll(/(\d+(?:\.\d+)?)\s*(万|w|千|k|元)?/gi)]
    .map((match) => ({
      value: Number(match[1]),
      token: match[2]?.toLowerCase(),
    }))
    .filter((item) => Number.isFinite(item.value));

  if (numbers.length === 0) {
    return {
      raw: original,
      min: null,
      max: null,
      unit,
      months,
      comparable: false,
      note: "无法识别薪资数字",
    };
  }

  const inferredToken = numbers[0].token ?? numbers[1]?.token;
  const firstUnit = unitForToken(numbers[0].token, unitForToken(numbers[1]?.token, unit));
  const secondUnit = unitForToken(numbers[1]?.token, firstUnit);
  const min = numbers[0].value * tokenFactor(numbers[0].token ?? inferredToken, firstUnit);
  const max = numbers.length > 1
    ? numbers[1].value * tokenFactor(numbers[1].token ?? inferredToken, secondUnit)
    : min;

  const openEnded = /以上|以下|起|至少|最高/.test(withoutMonths);
  const ambiguousWan = /万|w/i.test(withoutMonths) && unit === null;
  const invertedRange = numbers.length > 1 && min > max;
  const comparable = unit !== null && months === null && !openEnded && !ambiguousWan && !invertedRange;

  let note = "";
  if (invertedRange) note = "薪资区间倒置，不进入统一比较";
  else if (ambiguousWan) note = "出现“万”但未标明月薪或年薪，不能统一比较";
  else if (months !== null) note = `包含 ${months} 薪，总包与月薪不可直接混算`;
  else if (openEnded) note = "薪资为开放区间（以上/以下/起），不进入统一比较";
  else if (unit === null) note = "未识别到月/日/时/年单位，不进入统一比较";
  else note = `按${UNIT_LABELS[unit]}薪记录`;

  return {
    raw: original,
    min,
    max,
    unit,
    months,
    comparable,
    note,
  };
}
