import {
  LayoutDashboard,
  Route,
  BrainCircuit,
  Database,
  ShieldCheck,
  MessageSquareText,
  UserCog,
  type LucideIcon,
} from "lucide-react";

/** 用户导航项（聊天和登录后页面共享） */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 仅管理员可见 */
  adminOnly?: boolean;
}

/** 主功能导航 */
export const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "成长概览", icon: LayoutDashboard },
  { href: "/path", label: "职业路径", icon: Route },
  { href: "/simulation", label: "模拟训练", icon: BrainCircuit },
  { href: "/resources", label: "资源中心", icon: Database },
  { href: "/memory", label: "记忆权限", icon: ShieldCheck },
];

/** 管理员专属导航 */
export const adminNavItem: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: UserCog,
  adminOnly: true,
};

/** 返回聊天入口 */
export const chatNavItem: NavItem = {
  href: "/",
  label: "返回 AI 对话",
  icon: MessageSquareText,
};
