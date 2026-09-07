import { COMPANION_PETS, getCompanionPet } from "@/lib/companion-pets";
import type { CompanionAppearance, VisibleCompanionAppearance } from "./companion-appearance-types";

export interface CompanionAppearanceOption {
  id: CompanionAppearance;
  label: string;
  description: string;
  /** Static portrait preview; null means the floating companion is hidden. */
  preview: string | null;
}

/** Shared option list for the dock menu and the privacy/settings page. */
export const companionAppearanceOptions: CompanionAppearanceOption[] = [
  ...COMPANION_PETS.map((pet) => ({
    id: pet.id,
    label: pet.name,
    description: pet.description,
    preview: pet.avatarUrl,
  })),
  {
    id: "kurisu",
    label: "Kurisu",
    description: "Live2D 知性形象，对话时更生动",
    preview: "/images/kurisu-avatar.png",
  },
  {
    id: "off",
    label: "收起形象",
    description: "隐藏浮动宠物，聊天对话保留当前形象",
    preview: null,
  },
];

/** Display name for chat surfaces; `off` is never passed here because the provider
 *  keeps the last visible pet for chat while the dock is hidden. */
export function companionDisplayName(appearance: VisibleCompanionAppearance): string {
  if (appearance === "kurisu") return "Kurisu";
  return getCompanionPet(appearance).name;
}

export function companionAvatarUrl(appearance: VisibleCompanionAppearance): string {
  if (appearance === "kurisu") return "/images/kurisu-avatar.png";
  return getCompanionPet(appearance).avatarUrl;
}
