import { isCompanionPetId, type CompanionPetId } from "@/lib/companion-pets";

export type CompanionAppearance = CompanionPetId | "kurisu" | "off";
export type VisibleCompanionAppearance = CompanionPetId | "kurisu";

export const COMPANION_APPEARANCE_IDS = [
  "shuangling",
  "kurisu",
  "anya",
  "doraemon",
  "kun-like",
  "lulu-capybara",
  "shinchan",
  "off",
] as const;

export function isCompanionAppearance(value: string | null | undefined): value is CompanionAppearance {
  return (COMPANION_APPEARANCE_IDS as readonly string[]).includes(value ?? "");
}

export function toVisibleAppearance(value: CompanionAppearance): VisibleCompanionAppearance {
  return value === "off" ? "shuangling" : value;
}

export function isPetId(value: CompanionAppearance | string): value is CompanionPetId {
  return isCompanionPetId(value);
}
