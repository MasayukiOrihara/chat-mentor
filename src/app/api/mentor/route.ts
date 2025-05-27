import { PromptTemplate } from "@langchain/core/prompts";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import {
  Annotation,
  messagesStateReducer,
  StateGraph,
} from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import Anthropic from "@anthropic-ai/sdk";

// 遷移の状態を定義
type States = {
  isFirst: boolean;
};
const transitionStates: States = {
  isFirst: true,
};

type ChecklistItem = {
  name: string; // 項目名
  checked: boolean; // チェック状態
  comment?: string; // 任意の補足コメント
};

const checklist: ChecklistItem[] = [
  {
    name: "具体的にどんなことがあった？",
    checked: false,
    comment: "",
  },
  {
    name: "いつからその問題がある？",
    checked: false,
    comment: "",
  },
  {
    name: "関わっている人は誰？",
    checked: false,
    comment: "",
  },
  {
    name: "どこで起きた？",
    checked: false,
    comment: "",
  },
];

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const ANTHROPIC_MODEL_3_5 = "claude-3-5-haiku-20241022";

/**
 * ノード定義
 */
async function checkPrevState() {
  /** 前ターンの状態をチェックする初回ノード */
  console.log("🔍 チェック初回ノード");
  console.log("前回の状態: ", transitionStates);

  //　前回の状態を反映
  return {
    transition: { ...transitionStates },
  };
}

async function initSetting() {
  /** 初期設定を行うノード */
  console.log("🔧 初期設定ノード");

  // チェックリストを用意する
  console.log("チェックリスト: ", checklist);

  transitionStates.isFirst = false;
}

async function prepareQuestion({ messages }: typeof MentorAnnotation.State) {
  /** 質問を準備するノード */
  console.log("📝 質問準備ノード");

  // ユーザーの発言からチェックリストを更新
  const userMessage = messages[messages.length - 1].content;
  console.log("ユーザーの発言: ", userMessage);

  for (const item of checklist) {
    // Anthropic APIを使用して、ユーザーの発言がチェックリスト項目に関連しているかどうかを判断
    const checkUserMessage = await anthropic.messages.create({
      model: ANTHROPIC_MODEL_3_5,
      max_tokens: 1000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `次のチェックリスト項目に対して、ユーザーの発言が質問の答えになっているかどうかを判断してください。\n\n${item.name}\n\nユーザーの発言: ${userMessage}\n\n関連している場合は「YES」と述べ質問の答えとなる該当部分のみ抜き出してください。そうでない場合は「NO」と答えてください。理由はいりません。`,
        },
      ],
    });

    // 回答を整形
    const textBlock = checkUserMessage.content.find(
      (block) => block.type === "text"
    );
    const response = textBlock?.text?.trim().toUpperCase() || "";

    console.log(`〇 "${item.name}" : `, response);

    // 回答の中に "YES" が含まれている場合
    if (response.includes("YES")) {
      item.checked = true;
      item.comment += textBlock?.text?.replace("YES", "").trim() || "";

      console.log(`✔️ "${item.name}" がチェックされました: `, item.comment);
    }
  }
}

async function addContext({ messages }: typeof MentorAnnotation.State) {
  /** コンテキストを追加するノード */
  console.log("📚 コンテキスト追加ノード");

  const userMessage = messages[messages.length - 1].content;
  console.log("ユーザーの発言: ", userMessage);

  // AIに次の質問を渡す用として整形
  let checkListQuestion = "";
  for (const item of checklist) {
    checkListQuestion += "・" + item.name + "\n";
  }

  // どれを質問するかを決めさせる
  const selectNextQuestion = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 1000,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `次のチェックリスト項目に対して、もしあなたがメンターだったらユーザーの発言を深堀するならどの質問をするか1つだけ選んでください。\n\n${checkListQuestion}\n\nユーザーの発言: ${userMessage}\n\n深堀する必要がないと判断した場合は「必要なし」と述べてください。理由はいりません。`,
      },
    ],
  });

  // 回答を整形
  const textBlock = selectNextQuestion.content.find(
    (block) => block.type === "text"
  );
  const response = textBlock?.text?.trim().toUpperCase() || "";

  console.log(response);

  return {
    contexts: [new AIMessage(response)],
  };
}

async function buildSendData() {
  /** 送信データを加工するノード */
  console.log("📤 送信データ加工ノード");

  // contextsの中身をさらに整形したい場合
}
async function saveData() {
  /** データを保存するノード */
  console.log("💾 データ保存ノード");

  // チェックリストをJSON形式で保存したい場合はここへ

  console.log("チェックリストの状態: \n", checklist);
}

/**
 * グラフ定義
 */
const MentorAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  contexts: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  transition: Annotation<States>({
    value: (
      state: States = {
        isFirst: true,
      },
      action: Partial<States>
    ) => ({
      ...state,
      ...action,
    }),
  }),
});

const MentorGraph = new StateGraph(MentorAnnotation)
  .addNode("check", checkPrevState)
  .addNode("init", initSetting)
  .addNode("prepare", prepareQuestion)
  .addNode("context", addContext)
  .addNode("build", buildSendData)
  .addNode("save", saveData)
  .addEdge("__start__", "check")
  .addConditionalEdges("check", (state) =>
    state.transition.isFirst ? "init" : "prepare"
  )
  .addEdge("init", "prepare")
  .addEdge("prepare", "context")
  .addEdge("context", "build")
  .addEdge("build", "save")
  .addEdge("save", "__end__")
  .compile();

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

    console.log("💛 メンターチャットAPI ");
    console.log("🧠 モデル: ", modelName);
    console.log("---");

    /** メッセージ */
    const currentMessageContent = messages[messages.length - 1].content;

    /** LangGraph */
    const result = await MentorGraph.invoke({
      messages: [new HumanMessage(currentMessageContent)],
    });

    const text = result.contexts.map((msg) => msg.content).join("\n");
    console.log("📈 LangGraph: \n" + text);

    /**
     * フェイク用のモデルを使用して、そのまま応答を送信
     */
    const fakeModel = new FakeListChatModel({
      responses: [text],
    });
    const fakePrompt = PromptTemplate.fromTemplate("TEMPLATE1");
    const fakeChain = fakePrompt.pipe(fakeModel);
    const fakeStream = await fakeChain.invoke({});

    //return LangChainAdapter.toDataStreamResponse(fakeStream);
    return new Response(JSON.stringify(fakeStream));
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
