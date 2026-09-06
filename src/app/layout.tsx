import type { Metadata } from "next";
import "./globals.css";
import { GlobalKurisu } from "@/components/chat/global-kurisu";
import { AssistantProvider } from "@/components/chat/assistant-provider";
import { AssistantPanel } from "@/components/chat/assistant-panel";

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
          {children}
          <AssistantPanel />
          <GlobalKurisu />
        </AssistantProvider>
      </body>
    </html>
  );
}
