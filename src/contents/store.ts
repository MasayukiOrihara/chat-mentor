import { create } from "zustand";

type Model = "gpt-4o" | "claude-haiku" | "fake-llm";

type ModelState = {
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
};

export const useModelStore = create<ModelState>((set) => ({
  selectedModel: "gpt-4o",
  setSelectedModel: (model) => set({ selectedModel: model }),
}));
