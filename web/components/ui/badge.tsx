const variants = {
  default: "bg-accent/20 text-accent",
  admin: "bg-red-500/20 text-red-400",
  radiologist: "bg-blue-500/20 text-blue-400",
  viewer: "bg-green-500/20 text-green-400",
  muted: "bg-muted text-muted-foreground",
};

interface BadgeProps {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
