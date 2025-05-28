import { PromptTemplate } from "@langchain/core/prompts";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import {
  Annotation,
  messagesStateReducer,
  StateGraph,
} from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

// 遷移の状態を定義
type States = {
  isConsulting: boolean;
  isFirst: boolean;
  hasQuestion: boolean;
};
const transitionStates: States = {
  isConsulting: false, // メンターモードか
  isFirst: true, // 初回ターンか
  hasQuestion: true, // 質問することがあるか
};

type ChecklistItem = {
  question: string; // 項目名
  checked: boolean; // チェック状態
  comment?: string; // 任意の補足コメント
};

// 繰り返した回数を保持
let count = 0;

const checklist: ChecklistItem[][] = [
  [
    {
      question: "具体的にどんなことがあった？",
      checked: false,
      comment: "",
    },
    {
      question: "いつからその問題がある？",
      checked: false,
      comment: "",
    },
    {
      question: "関わっている人は誰？",
      checked: false,
      comment: "",
    },
    {
      question: "どこで起きた？",
      checked: false,
      comment: "",
    },
  ],
  [
    {
      question: "その時どんな気持ちだった？",
      checked: false,
      comment: "",
    },
    {
      question: "今はどう感じてる？",
      checked: false,
      comment: "",
    },
    {
      question: "一番引っかかっていることは何？",
      checked: false,
      comment: "",
    },
  ],
  [
    {
      question: "どうしたいと思っている？",
      checked: false,
      comment: "",
    },
    {
      question: "他にどんな選択肢があると思う？",
      checked: false,
      comment: "",
    },
    {
      question: "今すぐできそうなことは何？",
      checked: false,
      comment: "",
    },
  ],
];

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const ANTHROPIC_MODEL_3_5 = "claude-3-5-haiku-20241022";
const ANTHROPIC_MODEL_3 = "claude-3-haiku-20240307";

// 回答を整形する関数
function formatAnthropicMessage(
  anthropicMessage: Anthropic.Messages.Message & {
    _request_id?: string | null;
  }
) {
  const textBlock = anthropicMessage.content.find(
    (block) => block.type === "text"
  );
  return textBlock?.text?.trim().toUpperCase() || "";
}

// 単一メッセージの設定
const systemMessage = (context: string): MessageParam[] => {
  return [
    {
      role: "user",
      content: context,
    },
  ];
};

/**
 * ノード定義
 */

/** 前ターンの状態をチェックする初回ノード */
async function checkPrevState() {
  console.log("🔍 チェック初回ノード");
  console.log("前回の状態: ", transitionStates);

  //　前回の状態を反映
  console.log("チェックリスト: ", checklist);

  const intStep = Math.floor(count / 2);
  console.log(`相談を始めて ${count} ターン目です`);

  if (intStep === 3) {
    transitionStates.hasQuestion = false;
  }

  return {
    transition: { ...transitionStates },
    step: intStep,
  };
}

async function initSetting() {
  /** 初期設定を行うノード */
  console.log("🔧 初期設定ノード");

  count = 0;
  transitionStates.isConsulting = true;
  transitionStates.isFirst = false;
  transitionStates.hasQuestion = true;

  return {
    transition: { ...transitionStates },
    stap: count,
  };
}

/** 質問を準備するノード */
async function prepareQuestion({
  messages,
  contexts,
}: typeof MentorAnnotation.State) {
  console.log("📝 質問準備ノード");

  // 1. ユーザーの発言を取得
  const userMessage = messages[messages.length - 1].content;
  console.log("ユーザーの発言: ", userMessage);

  // 2. 会話継続の意思を確認
  const checkContenueTalk = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 5,
    temperature: 0,
    messages: systemMessage(
      `次のユーザーの発言から、ユーザーの「問題が解決した」もしくは「この会話をやめたがっている」により会話を終了するかどうかを判断してください。\n\n${userMessage}\n\n会話を終了する場合は「YES」と述べ、そうでない場合は「NO」と述べてください。それ以外述べないでください。`
    ),
  });
  const resContenueTalk = formatAnthropicMessage(checkContenueTalk);
  console.log("会話終了の意思: " + resContenueTalk);

  if (resContenueTalk.includes("YES")) {
    contexts = "相談の終了";
    transitionStates.isConsulting = false;
    transitionStates.isConsulting = true;

    return { contexts, transition: { ...transitionStates } };
  }

  // 3. チェックリストをプロンプト用のテキストに整形
  let checklistAllText = "";
  for (const subList of checklist) {
    for (const item of subList) {
      checklistAllText +=
        "question: " +
        item.question +
        "\n" +
        "checked: " +
        item.checked +
        "\n" +
        "comment: " +
        item.comment +
        "\n --- \n";
    }
  }

  // 4. チェックリストの質問との一致項目を特定
  const checkUserMessage = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 1000,
    temperature: 0,
    messages: systemMessage(
      `次のチェックリスト項目に対して、ユーザーの発言が「question: 」の答えになっているかどうかを判断してください。\n\n${checklistAllText}\n\nユーザーの発言: ${userMessage}\n\n関連している場合は「comment: 」に質問の答えとなる該当部分のみ抜き出して記述してください。また「comment: 」の変更をした場合は「checked: 」をtrueにしてください。出力はチェックリストのフォーマット通りとします。理由などの記述はいりません。`
    ),
  });
  const response = formatAnthropicMessage(checkUserMessage);
  console.log("一致項目の回答結果:\n" + response);

  // 5. JSONに戻す ※ anthropicくんの機嫌で崩れたフォーマット送ってくる可能性もあるからフォーマットチェックはした方がいい
  const blocks = response
    .split("---")
    .map((block) => block.trim())
    .filter(Boolean);

  for (const item of blocks) {
    const calams = item
      .split("\n")
      .map((calam) => calam.trim())
      .filter(Boolean);

    for (const group of checklist) {
      for (const item of group) {
        if (calams[0]?.includes(item.question)) {
          item.checked = calams[1]?.toLowerCase().includes("true") ?? false;

          if (calams[2]) {
            const index = calams[2].indexOf("COMMENT: ");
            if (index !== -1) {
              item.comment =
                (item.comment ?? "") +
                calams[2].slice(index + "COMMENT: ".length) +
                ", ";
            }
          }
        }
      }
    }
  }
}

/** コンテキストを追加するノード */
async function addContext({
  messages,
  contexts,
  step,
}: typeof MentorAnnotation.State) {
  console.log("📚 コンテキスト追加ノード");

  const userMessage = messages[messages.length - 1].content;
  console.log("ユーザーの発言: ", userMessage);

  // AIに次の質問を渡す用として整形
  let checkListQuestion = "";
  for (const item of checklist[step]) {
    checkListQuestion += "・" + item.question + "\n";
  }

  // どれを質問するかを決めさせる
  const selectNextQuestion = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 300,
    temperature: 0.5,
    messages: systemMessage(
      `次のチェックリスト項目に対して、もしあなたがメンターだったらユーザーの発言を深堀するならどの質問をするか1つだけ選んでください。\n\n${checkListQuestion}\n\nユーザーの発言: ${userMessage}\n\n深堀する必要がないと判断した場合は「必要なし」と述べてください。理由はいりません。`
    ),
  });
  contexts = formatAnthropicMessage(selectNextQuestion);
  console.log("contexts: " + contexts);

  return { contexts };
}

/** 送信データを加工するノード */
async function buildSendData({ contexts }: typeof MentorAnnotation.State) {
  console.log("📤 送信データ加工ノード");

  // contextsを出力
  return { messages: [new AIMessage(contexts)] };
}

/** データを保存するノード */
async function saveData() {
  console.log("💾 データ保存ノード");

  // チェックリストをJSON形式で保存したい場合はここへ
  // 終了処理もここ
  count++;

  // console.log("チェックリストの状態: \n", checklist);
}

/** 質問が終了して今回の話を総括するノード */
async function summarizeConversation({
  contexts,
}: typeof MentorAnnotation.State) {
  console.log("📢 総括ノード");

  // 1. チェックリストをテキストに変換
  let checklistAllText = "";
  for (const subList of checklist) {
    for (const item of subList) {
      checklistAllText +=
        "question: " +
        item.question +
        "\n" +
        "checked: " +
        item.checked +
        "\n" +
        "comment: " +
        item.comment +
        "\n --- \n";
    }
  }

  // 2. チェックリストを参考に総括をする
  const summarizeMessage = await anthropic.messages.create({
    model: ANTHROPIC_MODEL_3_5,
    max_tokens: 1000,
    temperature: 0,
    messages: systemMessage(
      `次のチェックリストに対して、総括として今回の相談内容をまとめてください。またユーザーに対してアドバイスを行い、これから行うべき行動を指示してください。\n\n${checklistAllText}`
    ),
  });
  contexts = formatAnthropicMessage(summarizeMessage);
  console.log("総括:\n" + contexts);

  return { contexts };
}

/**
 * グラフ定義
 */
const MentorAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  contexts: Annotation<string>({
    value: (state: string = "", action: string) => state + action,
    default: () => "",
  }),
  step: Annotation<number>({
    value: (state: number = 0, action: number) => action,
    default: () => 0,
  }),
  transition: Annotation<States>({
    value: (
      state: States = {
        isConsulting: false,
        isFirst: true,
        hasQuestion: true,
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
  .addNode("summary", summarizeConversation)
  .addEdge("__start__", "check")
  .addConditionalEdges("check", (state) =>
    state.transition.isFirst ? "init" : "prepare"
  )
  .addEdge("init", "prepare")
  .addConditionalEdges("prepare", (state) => {
    if (!state.transition.hasQuestion) return "summary";
    if (state.transition.isConsulting) return "context";
    return "build";
  })
  .addEdge("context", "build")
  .addEdge("build", "save")
  .addEdge("summary", "save")
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

    const text = result.messages.map((msg) => msg.content).join("\n");
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
