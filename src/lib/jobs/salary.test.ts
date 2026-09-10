import { describe, expect, it } from "vitest";
import { parseSalary } from "./salary";

describe("parseSalary", () => {
  it("parses monthly K ranges", () => {
    expect(parseSalary("10-15K")).toMatchObject({
      min: 10_000,
      max: 15_000,
      unit: "month",
      months: null,
      comparable: true,
    });
  });

  it("parses mixed 千/万 monthly ranges", () => {
    expect(parseSalary("8千-1.2万/月")).toMatchObject({
      min: 8_000,
      max: 12_000,
      unit: "month",
      comparable: true,
    });
  });

  it("keeps daily and hourly salaries in their own units", () => {
    expect(parseSalary("200-300元/天")).toMatchObject({ min: 200, max: 300, unit: "day", comparable: true });
    expect(parseSalary("300元/时")).toMatchObject({ min: 300, max: 300, unit: "hour", comparable: true });
  });

  it("parses annual ranges", () => {
    expect(parseSalary("20-40万/年")).toMatchObject({
      min: 200_000,
      max: 400_000,
      unit: "year",
      comparable: true,
    });
  });

  it("marks multi-pay and open-ended values as non-comparable", () => {
    expect(parseSalary("10-15K·13薪")).toMatchObject({
      min: 10_000,
      max: 15_000,
      unit: "month",
      months: 13,
      comparable: false,
    });
    expect(parseSalary("15K以上")).toMatchObject({ comparable: false });
  });

  it("does not guess an ambiguous 万 range without month/year unit", () => {
    expect(parseSalary("1.2-1.8万")).toMatchObject({
      unit: null,
      comparable: false,
    });
  });

  it("keeps 面议 and empty values unknown", () => {
    expect(parseSalary("面议")).toMatchObject({ min: null, max: null, comparable: false });
    expect(parseSalary("")).toMatchObject({ min: null, max: null, comparable: false });
  });

  it("keeps explicit annual amounts in yuan instead of multiplying by 10000", () => {
    expect(parseSalary("年薪200000元")).toMatchObject({
      min: 200_000,
      max: 200_000,
      unit: "year",
      comparable: true,
    });
  });

  it("marks an inverted salary range as non-comparable", () => {
    expect(parseSalary("15-10K")).toMatchObject({
      min: 15_000,
      max: 10_000,
      unit: "month",
      comparable: false,
    });
  });
});
