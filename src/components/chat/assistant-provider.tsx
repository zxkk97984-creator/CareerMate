"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAssistantController, type AssistantController } from "@/hooks/use-assistant-controller";

const AssistantControllerContext = createContext<AssistantController | null>(null);

/**
 * 在跨工作台导航保持挂载的层挂载单一助手控制器，避免路由切换重建/丢失会话与草稿。
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const controller = useAssistantController();
  const pathname = usePathname();
  const { initialize, reset } = controller;
  useEffect(() => {
    if (pathname === "/login" || pathname === "/") { reset(); return; }
    void initialize();
  }, [pathname, initialize, reset]);
  return (
    <AssistantControllerContext.Provider value={controller}>
      {children}
    </AssistantControllerContext.Provider>
  );
}

export function useAssistantControllerContext(): AssistantController {
  const value = useContext(AssistantControllerContext);
  if (!value) throw new Error("useAssistantControllerContext 必须在 AssistantProvider 内使用");
  return value;
}
