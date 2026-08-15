const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
};

const colorClasses = {
  indigo: "border-indigo-500",
  white: "border-white",
};

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: "indigo" | "white";
  className?: string;
}

export default function Spinner({
  size = "lg",
  color = "indigo",
  className,
}: SpinnerProps) {
  return (
    <div
      className={[
        sizeClasses[size],
        "border-2",
        colorClasses[color],
        "border-t-transparent rounded-full animate-spin",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
