import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { PromptTemplate } from "@langchain/core/prompts";
import { Message as VercelChatMessage, LangChainAdapter } from "ai";
import { ChatOpenAI } from "@langchain/openai";
import Anthropic from "@anthropic-ai/sdk";
import { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";

const openAiModel = new ChatOpenAI({
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.8,
  tags: ["mcp"],
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// 定数
const PYTHON_PATH = process.cwd() + "/mcp-server/.venv/Scripts/python.exe";
const ADD_PY_PATH = process.cwd() + "/mcp-server/add.py";
const SEARCH_PY_PATH = process.cwd() + "/mcp-server/search.py";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];

    /** メッセージ処理 */
    // ユーザーチャットの取得
    const current = messages[messages.length - 1];
    const formattedMessages = [
      {
        role: current.role,
        content: current.content,
      },
    ];
    // messages.slice(-1).map(formatMessage);
    console.log("✅ ユーザーの発言: ", formattedMessages);

    /**
     * 通信処理
     */
    // 通信方法の定義: 今回はPythonのサーバを参照
    const transportAdd = new StdioClientTransport({
      command: PYTHON_PATH,
      args: [ADD_PY_PATH],
    });

    const transportSearch = new StdioClientTransport({
      command: PYTHON_PATH,
      args: [SEARCH_PY_PATH],
    });

    // Clientの初期化
    const client = new Client({
      name: "mcp-client",
      version: "1.0.0",
    });
    // await client.connect(transportAdd);
    await client.connect(transportSearch);

    /**
     * ツール選定
     */
    const listRes = await client.listTools();

    // 使用可能ツールの取得（LLM用に整形）
    const availableTools = listRes.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
    console.log(
      "✅ Available tools:",
      availableTools.map((t) => t.name)
    );

    // anthropicのツール選定
    const selectTools = await anthropic.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1000,
      messages: formattedMessages,
      tools: availableTools,
    });

    console.log(selectTools.content.map((t) => t.type));

    /**
     * 応答処理とツール・コールの処理
     */
    const finalText: string[] = [];
    const assistantMessageContent: any[] = [];
    const toolCalls: ToolUseBlock[] = [];

    for (const content of selectTools.content) {
      if (content.type === "text") {
        // 通常のテキスト応答の場合
        finalText.push(content.text);
        assistantMessageContent.push(content);
      } else if (content.type === "tool_use") {
        // ツールコールの場合
        toolCalls.push(content);
        assistantMessageContent.push(content);
      }
    }

    // ツールコールがある場合の処理
    if (toolCalls.length != 0) {
      // ツールコールの結果をメッセージに記録
      formattedMessages.push({
        role: "assistant",
        content: assistantMessageContent,
      });

      // ツールコールを実行
      for (const toolCall of toolCalls) {
        const result = await client.callTool({
          name: toolCall.name,
          arguments: toolCall.input as { [x: string]: unknown },
        });
        const keys = Object.keys(toolCall.input as object);
        const keys2 = Object.keys(result.content as object);
        console.log("🔨 名前:" + toolCall.name);
        console.log("🔨 因数:" + keys);
        console.log("🔨 結果:" + JSON.stringify(result.content));

        formattedMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: result.content,
            },
          ],
        });

        // ツールコールの結果をLLMに渡す
        const response = await anthropic.messages.create({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1000,
          messages: formattedMessages,
          tools: availableTools,
        });
        console.log(
          "✅ ツールコールの結果:",
          response.content.map((t) => t.type)
        );

        finalText.push(
          ...response.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
        );
        console.log("✅ 最終ツールコールの結果:", finalText);
        break;
      }
    }

    /**
     * フェイク用のモデルを使用して、そのまま応答を送信
     */
    const fakeModel = new FakeListChatModel({
      responses: [finalText.join("\n")],
    });
    const prompt = PromptTemplate.fromTemplate("TEMPLATE1");
    const chain = prompt.pipe(fakeModel);
    const stream = await chain.invoke({});

    return new Response(JSON.stringify(stream));
  } catch (error) {
    if (error instanceof Error) {
      console.log(error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown error occurred" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
