import { redirect } from "next/navigation";

// 兼容深链接：聊天已统一到成长概览页的助手面板，/chat 保留跳转入口。
// 后续由助手面板读取 ?assistant=open 自动展开（T07），此处保证不落到失效独立聊天页。
export default function ChatPage() {
  redirect("/dashboard");
}
