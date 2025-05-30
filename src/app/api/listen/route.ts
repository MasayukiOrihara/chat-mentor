import { Model } from "@/src/contents/type";
import { getModel } from "@/src/contents/utils";
import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage } from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";
import { Message as VercelChatMessage, LangChainAdapter } from "ai";
import { Client } from "langsmith";
import { UserMessage } from "@/src/contents/utils";

// 定数
const ANTHROPIC_MODEL_3_5 = "claude-3-5-haiku-20241022";
//const ANTHROPIC_MODEL_3 = "claude-3-haiku-20240307";
const CONCERNS_JUDGE_TEXT = "悩みや不安からきている相談";
const INSTRUCTION_JUDGE_TEXT = "AIに対する指示や標準のAIでは解決できない問題";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

// 相談中のフラグ
let hasConcerns = false;
let wasConcerns = false;

/** YES/NO を答えさせる関数 */
async function getYesNoResponse(question: string, questionType: string) {
  const GET_YES_NO_RESPONSE = await client.pullPromptCommit(
    "listen_get-yes-no-response"
  );
  const promptTextResponse = GET_YES_NO_RESPONSE.manifest.kwargs.template
    .replace("{question}", question)
    .replace("{question_type}", questionType);
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 2,
    temperature: 0,
    messages: UserMessage(promptTextResponse),
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
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ messages, model: modelName }),
  });

  const body = await res.json();
  if (!res.ok) {
    const errorBody = body.catch(() => null);
    if (errorBody && errorBody.message) {
      throw new Error(`API error: ${errorBody.message}`);
    }

    // JSONでなければテキストを取得
    const text = body.text();
    throw new Error(`API error: ${text || res.statusText}`);
  }

  return body;
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

    // パス
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    console.log("API: " + baseUrl);

    /** メッセージ */
    const formatMessage = (message: VercelChatMessage) => {
      return `${message.role}: ${message.content}`;
    };
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;

    /** 悩み相談 */
    const concernsAnswer = await getYesNoResponse(
      currentMessageContent,
      CONCERNS_JUDGE_TEXT
    );
    console.log("💛 悩み: " + concernsAnswer + " フラグ: " + hasConcerns);

    /** 指示 */
    const instructionAnswer = await getYesNoResponse(
      currentMessageContent,
      INSTRUCTION_JUDGE_TEXT
    );
    console.log("🔨 指示: " + instructionAnswer);

    /** 回答の聞き出し */
    let response = null;
    if (concernsAnswer === "YES" || hasConcerns) {
      hasConcerns = true;
      response = await getResult(baseUrl + "/api/mentor", messages, modelName);

      // 会話が終わったことを判断する
      const resText = response ? response.kwargs.content : "";
      if (resText.includes("--相談の終了--")) {
        console.log("💛 お悩み相談の終了");
        hasConcerns = false;
      }
    } else if (instructionAnswer === "YES") {
      response = await getResult(
        baseUrl + "/api/mcp-client",
        messages,
        modelName
      );
    }

    /** 応答を作成 */
    let chatTemplate = await client.pullPromptCommit("listen_chat-charactor");
    if (!hasConcerns && wasConcerns) {
      chatTemplate = await client.pullPromptCommit("listen_mentor-finish");
      console.log("has: " + hasConcerns + "\n" + "was: " + wasConcerns);
    }

    let prompt = PromptTemplate.fromTemplate(
      chatTemplate.manifest.kwargs.template
    );
    const model = getModel(modelName);

    const chain = prompt.pipe(model);
    const stream = await chain.stream({
      chat_history: formattedPreviousMessages.join("\n"),
      ai_input: response ? response.kwargs.content : "悩み相談ではありません。",
      user_input: currentMessageContent,
    });

    // 最後の処理
    wasConcerns = hasConcerns;

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
