import type { ReactNode } from "react";

interface Props {
  active: boolean;
  children: ReactNode;
}

export function ViewPane({ active, children }: Props) {
  return (
    <div
      className={`view-pane${active ? " view-pane-active" : ""}`}
      aria-hidden={!active}
      {...(!active ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}
