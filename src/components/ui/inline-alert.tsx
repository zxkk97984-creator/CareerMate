import { AlertTriangle, CheckCircle, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type AlertTone = "info" | "success" | "warning" | "error";

interface InlineAlertProps {
  tone?: AlertTone;
  className?: string;
  children: React.ReactNode;
}

const config: Record<
  AlertTone,
  { icon: LucideIcon; style: string; role: "status" | "alert" }
> = {
  info: {
    icon: Info,
    style: "bg-[var(--cm-info-bg)] text-[var(--cm-info)]",
    role: "status",
  },
  success: {
    icon: CheckCircle,
    style: "bg-[var(--cm-success-bg)] text-[var(--cm-success)]",
    role: "status",
  },
  warning: {
    icon: AlertTriangle,
    style: "bg-[var(--cm-warning-bg)] text-[var(--cm-warning)]",
    role: "alert",
  },
  error: {
    icon: XCircle,
    style: "bg-[var(--cm-danger-bg)] text-[var(--cm-danger)]",
    role: "alert",
  },
};

/**
 * 内联提示条
 *
 * tone: info | success | warning | error
 * 自动设置合适的 role（status 或 alert）
 */
export function InlineAlert({
  tone = "info",
  className,
  children,
}: InlineAlertProps) {
  const { icon: Icon, style, role } = config[tone];

  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 rounded-[var(--cm-radius-control)] px-4 py-3 text-sm",
        style,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
