import { getModel } from "@/src/contents/utils";
import Anthropic from "@anthropic-ai/sdk";
import { PromptTemplate } from "@langchain/core/prompts";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { LangChainAdapter } from "ai";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/** YES/NO を答えさせる関数 */
async function getYesNoResponse(question: string, questionType: string) {
  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 10,
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
async function getResult(api: string, messages: any, modelName: any) {
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
    const currentMessageContent = messages[messages.length - 1].content;

    /** 悩み相談 */
    const concernsAnswer = await getYesNoResponse(
      currentMessageContent,
      "悩みや不安からきている相談"
    );
    console.log("🧠 悩み: " + concernsAnswer);

    /** 指示 */
    const instructionAnswer = await getYesNoResponse(
      currentMessageContent,
      "AIに対する指示"
    );
    console.log("🧠 指示: " + instructionAnswer);

    /** 回答の聞き出し */
    let response = null;
    if (concernsAnswer === "YES") {
      response = await getResult(
        "http://localhost:3000/api/mentor",
        messages,
        modelName
      );
    } else if (instructionAnswer === "YES") {
      response = await getResult(
        "http://localhost:3000/api/mcp-client",
        messages,
        modelName
      );
    } else {
      response = await getResult(
        "http://localhost:3000/api/chat",
        messages,
        modelName
      );
    }

    /**
     * フェイク用のモデルを使用して、応答を生成
     */
    const fakeModel = new FakeListChatModel({
      responses: [
        response ? response.kwargs.content : "悩み相談ではありません。",
      ],
    });
    const prompt = PromptTemplate.fromTemplate(
      `system: 以下のメッセージを元にユーザーに回答してください。\n\nAI: {ai_input}\nuser: {user_input}\nAI: `
    );
    const model = getModel(modelName);

    const chain = prompt.pipe(model);
    const stream = await chain.stream({
      ai_input: response ? response.kwargs.content : "悩み相談ではありません。",
      user_input: currentMessageContent,
    });

    return LangChainAdapter.toDataStreamResponse(stream);
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
