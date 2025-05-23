"use client";

import React, { useState } from "react";
import { Chat } from "../components/chat";
import { Header } from "../components/header";

type Model = "gpt-4o" | "claude-haiku" | "fake-llm";

export default function Home() {
  const [model, setModel] = useState<Model>("gpt-4o");

  return (
    <div className="h-screen flex flex-col bg-zinc-900">
      <Header selectedModel={model} onModelChange={setModel} />
      <Chat model={model} />
    </div>
  );
}
