import { create } from "zustand";
import { Model } from "./type";

type ModelState = {
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
};

export const useModelStore = create<ModelState>((set) => ({
  selectedModel: "gpt-4o",
  setSelectedModel: (model) => set({ selectedModel: model }),
}));
