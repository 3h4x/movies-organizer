"use client";
// tamtam inspected 2026-05-21

import { useState } from "react";
import { CARD_ACTION_TOGGLE_CLASS } from "./card-action-styles";

interface CardActionItem {
  key: string;
  label: string;
  icon: string;
  className: string;
  onClick: () => void;
}

interface CardActionStackProps {
  actions: CardActionItem[];
}

export default function CardActionStack({ actions }: CardActionStackProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function runAction(action: CardActionItem) {
    action.onClick();
    setMobileOpen(false);
  }

  return (
    <div className="absolute right-1 bottom-14 z-10">
      <div className="pointer-events-none hidden flex-col gap-1 opacity-0 transition-all duration-200 [@media(hover:hover)]:flex [@media(hover:hover)]:group-hover/rec:pointer-events-auto [@media(hover:hover)]:group-hover/rec:opacity-100 [@media(hover:hover)]:group-hover/wish:pointer-events-auto [@media(hover:hover)]:group-hover/wish:opacity-100">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={(e) => {
              e.stopPropagation();
              runAction(action);
            }}
            className={action.className}
            title={action.label}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-end gap-1 [@media(hover:hover)]:hidden">
        {mobileOpen && (
          <div className="mb-1 flex flex-col gap-1 rounded-xl border border-gray-700/60 bg-gray-950/80 p-1 shadow-2xl backdrop-blur-md">
            {actions.map((action) => (
              <button
                key={action.key}
                onClick={(e) => {
                  e.stopPropagation();
                  runAction(action);
                }}
                className={action.className}
                title={action.label}
                aria-label={action.label}
              >
                {action.icon}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMobileOpen((open) => !open);
          }}
          className={CARD_ACTION_TOGGLE_CLASS}
          title={mobileOpen ? "Hide actions" : "Show actions"}
          aria-label={mobileOpen ? "Hide actions" : "Show actions"}
        >
          {mobileOpen ? "✕" : "⋯"}
        </button>
      </div>
    </div>
  );
}
