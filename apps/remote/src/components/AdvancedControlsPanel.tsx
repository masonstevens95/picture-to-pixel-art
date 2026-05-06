import type { ReactNode } from "react";

/**
 * Collapsible panel that hosts the v2 controls (saturation, aspect ratio,
 * palette mode, brand colors). Closed by default — v1's simple flow is
 * the primary surface; advanced controls are one click away.
 *
 * Native <details>/<summary> for keyboard accessibility (Enter/Space toggle
 * for free) and zero JS state. The summary marker is suppressed via CSS
 * and replaced with a chevron that rotates on open via the [open]
 * attribute selector.
 */

export interface AdvancedControlsPanelProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function AdvancedControlsPanel({ children, defaultOpen = false }: AdvancedControlsPanelProps) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-neutral-800 bg-neutral-900 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary
        className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-neutral-200 hover:text-neutral-50 [&::marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        aria-label="Toggle advanced controls"
      >
        <span>Advanced controls</span>
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-150 group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-neutral-800 p-4">{children}</div>
    </details>
  );
}

export default AdvancedControlsPanel;
