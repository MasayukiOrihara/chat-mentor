import { getModel } from "../../../contents/utils";
import { PromptTemplate } from "@langchain/core/prompts";
import { Message as VercelChatMessage, LangChainAdapter } from "ai";
import { Client } from "langsmith";
import { readFileSync } from "fs";
import { resolve } from "path";

// プロンプト取得用クライアント
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

/**
 * チャット応答AI
 * @param req
 * @returns
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const modelName = body.model ?? "fake-llm";

    console.log("チャット応答AIのモデル: ", modelName);

    /** メッセージ */
    const formatMessage = (message: VercelChatMessage) => {
      return `${message.role}: ${message.content}`;
    };
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;

    const model = getModel(modelName);

    /** プロンプト */
    const chatTemplate = await client.pullPromptCommit("chat-menter-charactor");
    const prompt = PromptTemplate.fromTemplate(
      chatTemplate.manifest.kwargs.template
    );

    /** LLM処理 */
    const chain = prompt.pipe(model);
    const stream = await chain.invoke({
      history: formattedPreviousMessages.join("\n"),
      input: currentMessageContent,
    });

    return new Response(JSON.stringify(stream));
  } catch (error) {
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown error occurred" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
