"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  isCompanionAppearance,
  toVisibleAppearance,
  type CompanionAppearance,
  type VisibleCompanionAppearance,
} from "./companion-appearance-types";

export type { CompanionAppearance, VisibleCompanionAppearance } from "./companion-appearance-types";

const APPEARANCE_KEY = "careermate-companion-appearance";
const VISIBLE_APPEARANCE_KEY = "careermate-companion-visible-appearance";

interface CompanionAppearanceContextValue {
  appearance: CompanionAppearance;
  /** The identity shown in chat when the floating pet is hidden; keeps the last pet choice. */
  chatAppearance: VisibleCompanionAppearance;
  setAppearance: (value: CompanionAppearance) => void;
}

const CompanionAppearanceContext = createContext<CompanionAppearanceContextValue | null>(null);

function loadSavedAppearance(): CompanionAppearance {
  if (typeof window === "undefined") return "shuangling";
  try {
    const saved = window.localStorage.getItem(APPEARANCE_KEY);
    return isCompanionAppearance(saved) ? saved : "shuangling";
  } catch {
    return "shuangling";
  }
}

function loadSavedVisibleAppearance(appearance: CompanionAppearance): VisibleCompanionAppearance {
  if (typeof window === "undefined") return "shuangling";
  try {
    const saved = window.localStorage.getItem(VISIBLE_APPEARANCE_KEY);
    if (saved && isCompanionAppearance(saved) && saved !== "off") return saved;
  } catch {
    // Fall through to the persisted dock appearance below.
  }
  return toVisibleAppearance(appearance);
}

/** Single source of truth for the AI companion look.
 *  `appearance` drives the floating dock (and may be `off`), while `chatAppearance`
 *  keeps the last visible pet for message avatars and assistant titles. */
export function CompanionAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<CompanionAppearance>("shuangling");
  const [chatAppearance, setChatAppearance] = useState<VisibleCompanionAppearance>("shuangling");

  useEffect(() => {
    const saved = loadSavedAppearance();
    setAppearanceState(saved);
    setChatAppearance(loadSavedVisibleAppearance(saved));
  }, []);

  const value = useMemo<CompanionAppearanceContextValue>(() => ({
    appearance,
    chatAppearance,
    setAppearance: (next) => {
      setAppearanceState(next);
      if (next !== "off") {
        setChatAppearance(next);
        try { window.localStorage.setItem(VISIBLE_APPEARANCE_KEY, next); } catch {
          // Keep the session choice even when storage is unavailable.
        }
      }
      try { window.localStorage.setItem(APPEARANCE_KEY, next); } catch {
        // Storage can be unavailable in private browsing; keep the session choice.
      }
    },
  }), [appearance, chatAppearance]);

  return <CompanionAppearanceContext.Provider value={value}>{children}</CompanionAppearanceContext.Provider>;
}

export function useCompanionAppearance(): CompanionAppearanceContextValue {
  const value = useContext(CompanionAppearanceContext);
  if (!value) throw new Error("useCompanionAppearance 必须在 CompanionAppearanceProvider 内使用");
  return value;
}
