import { Model } from "@/src/contents/type";
import { getModel } from "@/src/contents/utils";
import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage } from "@langchain/core/messages";
import { ParamsFromFString, PromptTemplate } from "@langchain/core/prompts";
import { Message as VercelChatMessage, LangChainAdapter } from "ai";
import { Client } from "langsmith";

// 定数
const ANTHROPIC_MODEL_3 = "claude-3-haiku-20240307";

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
    const chatTemplate = await client.pullPromptCommit("chat-menter-charactor");
    const concernsFinishTemplate = `system:\n今までの会話と下記のAIのメッセージを参考に、会話が途中でも今までの相談を総括してください。また相談者のこれからについて具体的なアドバイスをしてあげてください。\n\n会話履歴:---\n{chat_history}\n---\n\nAI: {ai_input}\n\nuser: {user_input}\nassistant: `;

    let prompt = PromptTemplate.fromTemplate(
      chatTemplate.manifest.kwargs.template
    );
    // お悩み相談がひと段落したらまとめとこれからを述べるようにする？
    if (!hasConcerns && wasConcerns) {
      prompt = PromptTemplate.fromTemplate(concernsFinishTemplate);
      console.log("has: " + hasConcerns + "\n" + "was: " + wasConcerns);
    }
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
