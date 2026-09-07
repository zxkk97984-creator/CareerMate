"use client";
import type { CSSProperties } from "react";
import { companionFrames, type CompanionState } from "@/lib/companion-sprite";
import { getCompanionPet, type CompanionPetId } from "@/lib/companion-pets";
/** CSS steps play the original atlas; reduced-motion keeps its first pose. */
export function CompanionSprite({ state, width = 88, petId = "shuangling" }: { state: CompanionState; width?: number; petId?: CompanionPetId }) {
  const spec = companionFrames[state];
  const pet = getCompanionPet(petId);
  const height = Math.round(width * 208 / 192);
  const style = {
    width, height,
    backgroundImage: `url(${pet.spriteUrl})`,
    backgroundSize: `${width * 8}px ${height * pet.gridRows}px`,
    backgroundPositionY: `${-spec.row * height}px`,
    "--sprite-end": `${-spec.frames * width}px`,
    animation: `companion-frames ${spec.frames * 220}ms steps(${spec.frames}) infinite`,
  } as CSSProperties;
  return <span key={state} className="companion-sprite" style={style} role="img" aria-label={`${pet.name} · ${spec.label}`} data-sprite-state={state} data-pet-id={pet.id}/>;
}
