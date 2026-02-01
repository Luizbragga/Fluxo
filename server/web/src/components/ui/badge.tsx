import * as React from "react";

type BadgeVariant = "default" | "outline";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px]";
  const variants: Record<BadgeVariant, string> = {
    default: "border border-slate-700 bg-slate-900/60 text-slate-200",
    outline: "border border-slate-700 bg-transparent text-slate-200",
  };

  return (
    <span
      className={[base, variants[variant], className].join(" ")}
      {...props}
    />
  );
}
