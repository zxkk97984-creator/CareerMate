/** Companion pet registry copied from K12-Learning-platform/frontend/src/features/companion/lib/sprite.ts.
 *  The original spritesheets are copied unchanged; only the paths use the CareerMate public dir. */
export const COMPANION_PETS = [
  {
    id: "shuangling",
    name: "霜铃",
    description: "温柔可靠的银发学习伙伴。",
    spriteUrl: "/images/companion/shuangling.webp",
    avatarUrl: "/images/companion/shuangling-avatar.png",
    gridRows: 11,
  },
  {
    id: "anya",
    name: "阿尼亚",
    description: "活泼可爱的粉发校园伙伴。",
    spriteUrl: "/images/companion/anya.webp",
    avatarUrl: "/images/companion/anya-avatar.png",
    gridRows: 9,
  },
  {
    id: "doraemon",
    name: "哆啦A梦",
    description: "爱帮忙的蓝色机器猫伙伴。",
    spriteUrl: "/images/companion/doraemon.webp",
    avatarUrl: "/images/companion/doraemon-avatar.png",
    gridRows: 9,
  },
  {
    id: "kun-like",
    name: "Kun Like",
    description: "抱着篮球、充满活力的小鸡伙伴。",
    spriteUrl: "/images/companion/kun-like.webp",
    avatarUrl: "/images/companion/kun-like-avatar.png",
    gridRows: 9,
  },
  {
    id: "lulu-capybara",
    name: "噜噜",
    description: "软萌安静、圆滚滚的治愈水豚。",
    spriteUrl: "/images/companion/lulu-capybara.webp",
    avatarUrl: "/images/companion/lulu-capybara-avatar.png",
    gridRows: 9,
  },
  {
    id: "shinchan",
    name: "小新",
    description: "古灵精怪的幼儿园小伙伴。",
    spriteUrl: "/images/companion/shinchan.webp",
    avatarUrl: "/images/companion/shinchan-avatar.png",
    gridRows: 9,
  },
] as const;

export type CompanionPetId = (typeof COMPANION_PETS)[number]["id"];
export type CompanionPet = (typeof COMPANION_PETS)[number];

export function getCompanionPet(id: string): CompanionPet {
  return COMPANION_PETS.find((pet) => pet.id === id) ?? COMPANION_PETS[0];
}

export function isCompanionPetId(id: string): id is CompanionPetId {
  return COMPANION_PETS.some((pet) => pet.id === id);
}
