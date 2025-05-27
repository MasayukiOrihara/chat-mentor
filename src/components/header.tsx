"use client";

import { useModelStore } from "../contents/store";
import { Model } from "../contents/type";
import { Button } from "./ui/button";

export const Header: React.FC = () => {
  const selectedModel = useModelStore((state) => state.selectedModel);
  const selectedSetModel = useModelStore((state) => state.setSelectedModel);

  return (
    <div className="sticky top-0 z-10 p-4 flex items-center justify-center gap-4 bg-zinc-900/90 shadow-md">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-row items-center gap-6">
          {["gpt-4o", "claude-haiku", "fake-llm"].map((model) => (
            <Button
              key={model}
              className={
                selectedModel === model
                  ? "bg-blue-500 px-3 py-1 rounded"
                  : "bg-gray-600 px-3 py-1 rounded"
              }
              onClick={() => selectedSetModel(model as Model)}
            >
              {model}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
