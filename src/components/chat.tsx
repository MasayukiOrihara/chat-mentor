"use client";

import { useChat } from "@ai-sdk/react";
import { LoaderCircleIcon, LoaderIcon, SendHorizontalIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Model = "gpt-4o" | "claude-haiku" | "fake-llm";

interface ChatProps {
  model: Model;
}

export const Chat: React.FC<ChatProps> = ({ model }) => {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    // APIの読み込み
    api: "api/listen",
    body: {
      model,
    },
    onError: (e) => {
      toast.error("エラーが発生しました");
      console.log(e);
    },
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col w-2xl h-full mx-auto gap-2 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-y-auto mb-18">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "whitespace-pre-wrap px-5 py-3 rounded-lg mb-2 mx-8 flex gap-2",
              message.role === "user"
                ? "border text-neutral-500 self-start"
                : "text-gray-400 self-end"
            )}
          >
            {message.role === "assistant" && (
              <div className="h-8 px-3 py-2 font-bold text-xs rounded-lg bg-[#ff6467]/20 text-zinc-500 w-auto whitespace-nowrap">
                回答
              </div>
            )}
            {message.parts.map((part, i) => (
              <div
                key={`${message.id}-${i}`}
                className="break-words overflow-hidden"
              >
                {"text" in part ? (
                  <p className="mt-1" style={{ overflowWrap: "anywhere" }}>
                    {part.text}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {status === "submitted" && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg mb-2 mx-8">
            <LoaderCircleIcon className="animate-spin h-6 w-6 text-gray-400" />
            <span className="text-gray-400">AIくんが 考えています...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="w-auto max-w-2xl p-4">
        <div className="flex w-full gap-4">
          <Input
            className="bg-zinc-800 w-full p-2 h-12 border border-zinc-700 rounded shadow-xl text-white placeholder:text-neutral-400"
            value={input}
            placeholder="回答をしてください... [ENTER で 改行]"
            disabled={status === "submitted"}
            onChange={handleInputChange}
          />

          <Button
            type="submit"
            disabled={status === "submitted"}
            className="w-18 h-10 bg-[#00bc7d] text-white p-2 rounded hover:bg-emerald-900 hover:cursor-pointer hover:text-white/40 self-end"
          >
            {status === "submitted" ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <SendHorizontalIcon />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
