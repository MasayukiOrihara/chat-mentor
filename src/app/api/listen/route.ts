import { Model } from "@/src/contents/type";
import { getModel } from "@/src/contents/utils";
import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage } from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";
import { Message as VercelChatMessage, LangChainAdapter } from "ai";
import { Client } from "langsmith";

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000"; // ローカル用

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const ANTHROPIC_MODEL_3 = "claude-3-haiku-20240307";

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

// 相談中のフラグ
let hasConcerns = false;

/** YES/NO を答えさせる関数 */
async function getYesNoResponse(question: string, questionType: string) {
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3,
    max_tokens: 10,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `${question}\nこの文章は ${questionType} ですか？YES または NO のどちらかのみを出力してください。`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text?.trim().toUpperCase() || "";
}

/** APIから結果を取得 */
async function getResult(
  api: string,
  messages: ChatMessage[],
  modelName: Model
) {
  const res = await fetch(api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, model: modelName }),
  });
  return await res.json();
}

/**
 * 会話判断用AI
 * @param req
 * @returns
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const modelName = body.model ?? "fake-llm";

    /** メッセージ */
    const formatMessage = (message: VercelChatMessage) => {
      return `${message.role}: ${message.content}`;
    };
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;

    /** 悩み相談 */
    const concernsAnswer = await getYesNoResponse(
      currentMessageContent,
      "悩みや不安からきている相談"
    );
    console.log("💛 悩み: " + concernsAnswer + " フラグ: " + hasConcerns);

    /** 指示 */
    const instructionAnswer = await getYesNoResponse(
      currentMessageContent,
      "AIに対する指示や標準のAIでは解決できない問題"
    );
    console.log("🔨 指示: " + instructionAnswer);

    /** 回答の聞き出し */
    let response = null;
    if (concernsAnswer === "YES" || hasConcerns) {
      hasConcerns = true;
      response = await getResult(baseUrl + "/api/mentor", messages, modelName);
    } else if (instructionAnswer === "YES") {
      response = await getResult(
        baseUrl + "/api/mcp-client",
        messages,
        modelName
      );
    }

    /** 応答を作成 */
    const chatTemplate = await client.pullPromptCommit("chat-menter-charactor");
    const prompt = PromptTemplate.fromTemplate(
      chatTemplate.manifest.kwargs.template
    );
    const model = getModel(modelName);

    const chain = prompt.pipe(model);
    const stream = await chain.stream({
      chat_history: formattedPreviousMessages.join("\n"),
      ai_input: response ? response.kwargs.content : "悩み相談ではありません。",
      user_input: currentMessageContent,
    });

    return LangChainAdapter.toDataStreamResponse(stream);
  } catch (error) {
    if (error instanceof Error) {
      console.log(error);
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
