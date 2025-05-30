import { PromptTemplate } from "@langchain/core/prompts";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import {
  Annotation,
  messagesStateReducer,
  StateGraph,
} from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { MentorStates, ChecklistItem } from "@/src/contents/type";
import { Client } from "langsmith";
import { PromptCommit } from "langsmith/schemas";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";

// 定数
const ANTHROPIC_MODEL_3_5 = "claude-3-5-haiku-20241022";
const ANTHROPIC_MODEL_3 = "claude-3-haiku-20240307";
const CONSULTING_FINISH_MESSAGE = "--相談の終了--\n";

// 遷移の状態保存
const transitionStates: MentorStates = {
  isConsulting: false, // メンターモードか
  hasQuestion: true, // 質問することがあるか
};

// 繰り返した回数
let count = 0;
// チェックリスト
const checklistJson: ChecklistItem[][] = [
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
// 全初期化
function init() {
  count = 0;
  transitionStates.isConsulting = false;
  transitionStates.hasQuestion = true;
}

// anthropic(haiku-3)(langchain経由)
const haiku3 = new ChatAnthropic({
  model: ANTHROPIC_MODEL_3,
  apiKey: process.env.ANTHROPIC_API_KEY!,
  maxTokens: 512,
  temperature: 0.3,
});
// anthropic(haiku-3.5)(langchain経由)
const haiku3_5 = new ChatAnthropic({
  model: ANTHROPIC_MODEL_3_5,
  apiKey: process.env.ANTHROPIC_API_KEY!,
  maxTokens: 5,
  temperature: 0,
});
// パサー
const stringParser = new StringOutputParser();

// langsmithからプロンプトの取得
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

/** プロンプトをすべて事前に読み込む（非同期処理） */
let allPrompt: PromptCommit[];
async function loadAllPrompts() {
  // langsmith側のプロンプトの名前
  const promptnames = [
    "mentor_check-contenue-talk",
    "mentor_check-user-message",
    "mentor_select-next-question",
    "mentor_summarize-message",
  ];
  // 読み込み開始
  const promises = promptnames.map((name) => client.pullPromptCommit(name));
  // 処理待ち
  const results = await Promise.all(promises);
  const prompts = results.filter(
    (prompt): prompt is NonNullable<typeof prompt> => prompt !== null
  );

  return prompts;
}

/**
 * ノード定義
 */
/** 前ターンの状態をチェックする初回ノード */
async function checkPrevState() {
  console.log("🔍 チェック初回ノード");
  console.log("前回の状態: ", transitionStates);

  //　前回の状態を確認
  console.log("チェックリスト: ", checklistJson);

  const intStep = Math.floor(count / 1);
  console.log(`相談を始めて ${count} ターン目`);
  console.log(`現在 STEP ${intStep}`);

  if (intStep === 3) {
    transitionStates.hasQuestion = false;
  }

  // プロンプトの読み込み
  allPrompt = await loadAllPrompts();

  return {
    transition: { ...transitionStates },
    step: intStep,
  };
}

async function initSetting() {
  /** 初期設定を行うノード */
  console.log("🔧 初期設定ノード");

  init(); // 初期化(念のため)

  // 初期設定
  transitionStates.isConsulting = true;

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

  // // 2. 会話継続の意思を確認
  const contenueTemplate = allPrompt[0].manifest.kwargs.template;
  const checkContenueTalk = await PromptTemplate.fromTemplate(contenueTemplate)
    .pipe(haiku3_5)
    .pipe(stringParser)
    .invoke({ user_message: userMessage });

  console.log("会話終了の意思: " + checkContenueTalk);

  // 継続の意思なしと判断
  if (checkContenueTalk.includes("YES")) {
    transitionStates.hasQuestion = false;
    return { contexts, transition: { ...transitionStates } };
  }

  // 3. チェックリストをプロンプト用のテキストに整形
  let checklistAllText = "";
  for (const subList of checklistJson) {
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
  const userTemplate = allPrompt[1].manifest.kwargs.template;
  const checkUserMessage = await PromptTemplate.fromTemplate(userTemplate)
    .pipe(haiku3)
    .pipe(stringParser)
    .invoke({ checklist_text: checklistAllText, user_message: userMessage });
  console.log("一致項目の回答結果:\n" + checkUserMessage);

  // 5. JSONに戻す ※ anthropicくんの機嫌で崩れたフォーマット送ってくる可能性もあるからフォーマットチェックはした方がいい
  const blocks = checkUserMessage
    .split("---")
    .map((block) => block.trim())
    .filter(Boolean);

  for (const item of blocks) {
    const calams = item
      .split("\n")
      .map((calam) => calam.trim())
      .filter(Boolean);

    for (const group of checklistJson) {
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
  let checklistQuestion = "";
  for (const item of checklistJson[step]) {
    checklistQuestion += "・" + item.question + "\n";
  }

  // どれを質問するかを決めさせる
  const selectTemplate = allPrompt[2].manifest.kwargs.template;
  const selectNextQuestion = await PromptTemplate.fromTemplate(selectTemplate)
    .pipe(haiku3)
    .pipe(stringParser)
    .invoke({
      checklist_question: checklistQuestion,
      user_message: userMessage,
    });
  console.log("一致項目の回答結果:\n" + selectNextQuestion);

  contexts = selectNextQuestion;
  console.log("contexts: " + contexts);

  return { contexts };
}

/** 送信データを加工するノード */
async function buildSendData({
  messages,
  contexts,
}: typeof MentorAnnotation.State) {
  console.log("📤 送信データ加工ノード");

  // contextsを出力
  return { messages: [...messages, new AIMessage(contexts)] };
}

/** データを保存するノード */
async function saveData() {
  console.log("💾 データ保存ノード");

  // チェックリストをJSON形式で保存したい場合はここへ
  // 終了処理もここ
  count++;
}

/** 質問が終了して今回の話を総括するノード */
async function summarizeConversation({
  contexts,
}: typeof MentorAnnotation.State) {
  console.log("📢 総括ノード");

  // 1. チェックリストをテキストに変換
  let checklistAllText = "";
  for (const subList of checklistJson) {
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
  const summarizeTemplate = allPrompt[3].manifest.kwargs.template;
  const summarizeMessage = await PromptTemplate.fromTemplate(summarizeTemplate)
    .pipe(haiku3)
    .pipe(stringParser)
    .invoke({ checklist_text: checklistAllText });

  contexts = CONSULTING_FINISH_MESSAGE + summarizeMessage;
  console.log("総括:\n" + contexts);

  // 初期化
  init();

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
    value: (action: number) => action,
    default: () => 0,
  }),
  transition: Annotation<MentorStates>({
    value: (
      state: MentorStates = {
        isConsulting: false,
        hasQuestion: true,
      },
      action: Partial<MentorStates>
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
    state.transition.isConsulting ? "prepare" : "init"
  )
  .addEdge("init", "prepare")
  .addConditionalEdges("prepare", (state) =>
    state.transition.hasQuestion ? "context" : "summary"
  )
  .addEdge("context", "build")
  .addEdge("summary", "build")
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

    const text = result.messages[result.messages.length - 1].content.toString();
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
      console.error("API 500 error: " + error);
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
