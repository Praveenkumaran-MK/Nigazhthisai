import { cn } from "../utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-slate-200 dark:bg-[#141414]", className)}
    />
  );
}
