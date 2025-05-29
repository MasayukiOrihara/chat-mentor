/** メッセージ記憶用 */
export type MessageJson = {
  input: string;
  output: string;
  createdAt: string;
};

/** プロンプトテンプレート */
export type Variables = {
  id: number;
  name: string;
};
export type PromptTemplateJson = {
  name: string;
  template: string;
  variables?: Variables[];
};

/** なぞなぞ問題 */
export type RiddleMetadata = {
  id: number;
  answer: string;
  hint: string;
};
export type RiddleJson = {
  pageContent: string;
  metadata: RiddleMetadata;
};

/** フラグ管理用 */
export type States = {
  isStarted: boolean;
  isTarget: boolean;
  isReason: boolean;
  checkTarget: boolean;
  checkReason: boolean;
};
export type Flags = {
  deadline: boolean;
  function: boolean;
  quality: boolean;
};
/** モデル名 */
export type Model = "gpt-4o" | "claude-haiku" | "fake-llm";

/** mentorAPIでの状態定義 */
export type MentorStates = {
  isConsulting: boolean;
  hasQuestion: boolean;
};

// チェックリストの型
export type ChecklistItem = {
  question: string; // 項目名
  checked: boolean; // チェック状態
  comment?: string; // 任意の補足コメント
};
