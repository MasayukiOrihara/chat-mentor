"use client";

import { useChat } from "@ai-sdk/react";
import { SendHorizontalIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const Chat: React.FC = () => {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    // APIの読み込み
    api: "api/mcp-client",
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
    <div className="flex flex-col w-2xl h-full mx-5 gap-2 overflow-hidden">
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
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl p-4">
        <div className="flex w-full gap-4">
          <Input
            className="bg-zinc-800 w-full p-2 h-12 border border-zinc-700 rounded shadow-xl text-white placeholder:text-neutral-400"
            value={input}
            placeholder="回答をしてください... [ENTER で 改行]"
            onChange={handleInputChange}
          />

          <Button
            type="submit"
            className="w-18 h-10 bg-[#00bc7d] text-white p-2 rounded hover:bg-emerald-900 hover:cursor-pointer hover:text-white/40 self-end"
          >
            <SendHorizontalIcon />
          </Button>
        </div>
      </form>
    </div>
  );
};
