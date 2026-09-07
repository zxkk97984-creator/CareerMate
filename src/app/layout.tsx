import type { Metadata } from "next";
import "./globals.css";
import "./styles/redesign.css";
import "./styles/workspace-redesign.css";
import { AssistantProvider } from "@/components/chat/assistant-provider";
import { AssistantPanel } from "@/components/chat/assistant-panel";
import { CompanionDock } from "@/components/chat/companion-dock";
import { CompanionAppearanceProvider } from "@/components/chat/companion-appearance-provider";

export const metadata: Metadata = {
  title: "CareerMate",
  description: "AI 职业导航与终身学习伙伴系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AssistantProvider>
          <CompanionAppearanceProvider>
            {children}
            <AssistantPanel />
            <CompanionDock />
          </CompanionAppearanceProvider>
        </AssistantProvider>
      </body>
    </html>
  );
}
