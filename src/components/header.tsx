"use client";

import { Button } from "./ui/button";
import React, { useState } from "react";

type Model = "gpt-4o" | "claude-haiku" | "fake-llm";

/** ボタンの設定 */
interface HeaderProps {
  selectedModel: Model;
  onModelChange: (model: Model) => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedModel,
  onModelChange,
}) => {
  return (
    <div className="sticky top-0 z-10 p-4 flex items-center justify-center gap-4 bg-zinc-900/90 shadow-md">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-row items-center gap-6">
          <Button
            className={
              selectedModel === "gpt-4o"
                ? "bg-blue-500 px-3 py-1 rounded"
                : "bg-gray-600 px-3 py-1 rounded"
            }
            onClick={() => onModelChange("gpt-4o")}
          >
            gpt-4o
          </Button>
          <Button
            className={
              selectedModel === "claude-haiku"
                ? "bg-blue-500 px-3 py-1 rounded"
                : "bg-gray-600 px-3 py-1 rounded"
            }
            onClick={() => onModelChange("claude-haiku")}
          >
            claude-haiku
          </Button>
          <Button
            className={
              selectedModel === "fake-llm"
                ? "bg-blue-500 px-3 py-1 rounded"
                : "bg-gray-600 px-3 py-1 rounded"
            }
            onClick={() => onModelChange("fake-llm")}
          >
            fake-llm
          </Button>
        </div>
      </div>
    </div>
  );
};
