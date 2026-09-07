"use client";

import Image from "next/image";
import { EyeOff } from "lucide-react";
import { useCompanionAppearance } from "./companion-appearance-provider";
import { companionAppearanceOptions } from "./companion-appearance-options";

/** Settings-page appearance picker. The dock menu and this picker read the same provider,
 *  so choosing here immediately updates the pet, chat avatar and assistant title. */
export function CompanionAppearanceSelector() {
  const { appearance, setAppearance } = useCompanionAppearance();

  return (
    <div
      className="companion-appearance-options"
      data-testid="companion-appearance-selector"
      role="radiogroup"
      aria-label="AI 陪伴形象"
    >
      {companionAppearanceOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={appearance === option.id}
          aria-label={option.id === "off" ? "收起形象（隐藏浮动宠物）" : option.label}
          className={`companion-appearance-option ${appearance === option.id ? "active" : ""}`}
          data-companion-appearance-option={option.id}
          onClick={() => setAppearance(option.id)}
        >
          <span className="companion-appearance-preview" aria-hidden="true">
            {option.preview ? (
              <Image src={option.preview} alt="" width={56} height={56} />
            ) : (
              <span className="companion-appearance-off"><EyeOff size={22} /></span>
            )}
          </span>
          <span className="companion-appearance-name">{option.label}</span>
          <span className="companion-appearance-desc">{option.description}</span>
        </button>
      ))}
    </div>
  );
}
