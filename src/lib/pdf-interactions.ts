export type MatchRule = {
  text: string;
  occurrence: "first" | "all";
  wholeWord?: boolean;
};

export type DefinitionInteractionConfig = {
  id: string;
  type: "definition";
  match: MatchRule;
  title: string;
  description: string;
  color?: string;
};

export type ChoiceInteractionConfig = {
  id: string;
  type: "choice";
  groupId: string;
  match: MatchRule;
  isCorrect: boolean;
};

export type InteractionConfig = DefinitionInteractionConfig | ChoiceInteractionConfig;

export const INTERACTION_CONFIG: InteractionConfig[] = [
  {
    id: "def-optimistic",
    type: "definition",
    match: { text: "optimistic", occurrence: "all", wholeWord: true },
    title: "optimistic",
    description: "Feeling hopeful and confident that good things will happen.",
    color: "rgba(11, 87, 208, 0.15)",
  },
  {
    id: "def-duration",
    type: "definition",
    match: { text: "duration", occurrence: "all", wholeWord: true },
    title: "duration",
    description: "The length of time that something continues.",
    color: "rgba(208, 120, 11, 0.15)",
  },
  {
    id: "quiz-minutes",
    type: "choice",
    groupId: "minutes-vs-minute",
    match: { text: "minutes", occurrence: "first", wholeWord: true },
    isCorrect: true,
  },
  {
    id: "quiz-minute",
    type: "choice",
    groupId: "minutes-vs-minute",
    match: { text: "minute", occurrence: "first", wholeWord: true },
    isCorrect: false,
  },
];
