import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export interface MapFrameProps {
  children: ReactNode;
  className?: string;
  /** Rendered instead of children when offline/map tiles cannot load. */
  fallback?: ReactNode;
  isOffline?: boolean;
  heightClassName?: string;
}

/**
 * Styling/aspect-ratio wrapper around a react-leaflet <MapContainer>
 * (imported directly in apps — kept out of this package so @sbt/ui does not
 * force a Leaflet dependency on consumers that don't render maps). Provides
 * the offline fallback UI required by spec §51.
 */
export function MapFrame({ children, className, fallback, isOffline, heightClassName = "h-full" }: MapFrameProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-card border border-border-light dark:border-border-dark",
        heightClassName,
        className,
      )}
    >
      {isOffline && fallback ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-[#0a0a0a]">
          {fallback}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
