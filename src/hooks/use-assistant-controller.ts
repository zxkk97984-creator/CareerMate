"use client";
import { useState, useSyncExternalStore } from "react";
import { createAssistantStore } from "@/lib/assistant-store";
export function useAssistantController() {
  const [store] = useState(createAssistantStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, ...store };
}
export type AssistantController = ReturnType<typeof useAssistantController>;
export type AssistantPhase = AssistantController["phase"];
export type { ConversationItem } from "@/lib/chat/schemas";
export type { ChatMessagePart } from "@/lib/chat/persistence";
