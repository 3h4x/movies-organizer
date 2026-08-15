import type { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";

const variantClasses = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors font-medium",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  loading?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" color="white" className="mx-auto" />
      ) : (
        children
      )}
    </button>
  );
}
