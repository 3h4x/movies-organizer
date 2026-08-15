import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  message: ReactNode;
  subtext?: ReactNode;
  children?: ReactNode;
  className?: string;
  variant?: "section" | "card" | "plain";
}

export default function EmptyState({
  icon,
  message,
  subtext,
  children,
  className,
  variant = "section",
}: EmptyStateProps) {
  const variantClassName =
    variant === "card"
      ? "rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-8"
      : variant === "plain"
        ? "py-12"
        : "py-24";
  const messageClassName =
    variant === "plain" ? "text-gray-500" : "text-gray-400 text-lg font-medium";

  return (
    <div
      className={["text-center", variantClassName, className]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-800/50 flex items-center justify-center">
          <span className="text-4xl">{icon}</span>
        </div>
      )}
      <p className={messageClassName}>{message}</p>
      {subtext && (
        <p className="text-gray-600 text-sm mt-2">{subtext}</p>
      )}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
