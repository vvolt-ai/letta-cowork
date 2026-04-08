/**
 * Container for grouping timeline entries
 */

import type { ReactNode } from "react";

export type TimelineGroupProps = {
  children: ReactNode;
  className?: string;
};

export function TimelineGroup({ children, className = "" }: TimelineGroupProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {children}
    </div>
  );
}
