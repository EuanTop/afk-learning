import { ageBandFromAge, type LearnerProfile, type StoryTurnResponse } from "./shared/types.js";

function isEarlyEnglishLevel(level: string): boolean {
  return /10-15|16-21|<A1|启蒙|起步/i.test(level);
}

export function buildBootstrapWelcomeStory(params: {
  sessionId: string;
  profile: LearnerProfile;
}): StoryTurnResponse {
  const ageBand = ageBandFromAge(params.profile.age);
  const earlyMode = isEarlyEnglishLevel(params.profile.englishLevel);
  const deliveryMode = earlyMode ? "word-focus" : "letter-story";
  const learnerName = params.profile.name.trim() || "朋友";

  return {
    sessionId: params.sessionId,
    source: "openclaw-gateway",
    kind: "welcome",
    ageBand,
    title: "卡皮巴拉的第一封欢迎信",
    subtitle: "从今晚开始，我会替你出发找线索",
    deliveryMode,
    plan: {
      topic: "欢迎认识卡皮巴拉",
      researchQuery: "welcome onboarding",
      tomorrowPromise: "今晚你把想知道的主题告诉我，明天我就去找回来。",
      storyAngle: "卡皮巴拉先自我介绍，再告诉孩子如何许愿和收信。",
      capybaraMood: "warm",
      learningGoal: "认识产品使用方式，并先接触 hello、friend、letter 这些入门词。",
      englishFocus: ["hello", "friend", "letter"],
      reasoning: "第一封信先建立关系感和收信规则，不急着塞知识密度。",
    },
    research: null,
    timeline: {
      tonightQuestion: "今晚你想让我下一封寄回什么主题的信？",
      capybaraPromise: "你先许愿，我去找线索，等到明晚 20:30 左右把信送回来。",
      morningDelivery: "明晚打开这里，就能看到我带回来的信。",
    },
    scene: {
      title: "卡皮巴拉在等你",
      mood: "warm",
      palette: [
        { id: "sky", value: "#b9d3f2" },
        { id: "mist", value: "#eef5ff" },
        { id: "pond", value: "#8bb6df" },
        { id: "grass", value: "#7da66d" },
        { id: "paper", value: "#fff6df" },
        { id: "wood", value: "#8a633f" },
      ],
      layers: [],
      actors: [
        {
          id: "capybara-main",
          kind: "capybara",
          x: 50,
          y: 78,
          size: 28,
          facing: "right",
          motion: "still",
        },
      ],
      prompt: "warm capybara waiting beside a mailbox for tonight's wish",
      motionCue: "卡皮巴拉安静站在收信台边，等你把明天想听的主题告诉它。",
    },
    narration: "这是一封欢迎信。从今晚开始，卡皮巴拉会替你出发找线索，并在下一次固定送信时间把内容寄回来。",
    wordSpotlight: {
      focusWord: "letter",
      pronunciation: "/ˈletər/",
      meaningZh: "信",
      tapHint: "点一下，和我一起读 letter。",
      echoLine: "This is a letter.",
    },
    vocabularyCards: [
      {
        id: "vocab-1",
        word: "hello",
        pronunciation: "/həˈloʊ/",
        meaningZh: "你好",
        partOfSpeech: "interj",
        tapHint: "点一下，和卡皮巴拉打招呼。",
        example: "Hello, my friend.",
        exampleZh: "你好呀，我的朋友。",
      },
      {
        id: "vocab-2",
        word: "friend",
        pronunciation: "/frend/",
        meaningZh: "朋友",
        partOfSpeech: "noun",
        tapHint: "点一下，记住 friend。",
        example: "I am your friend.",
        exampleZh: "我是你的朋友。",
      },
      {
        id: "vocab-3",
        word: "letter",
        pronunciation: "/ˈletər/",
        meaningZh: "信",
        partOfSpeech: "noun",
        tapHint: "点一下，记住 letter。",
        example: "I will send a letter tomorrow.",
        exampleZh: "我明天会寄一封信回来。",
      },
    ],
    letter: {
      greeting: `Hi ${learnerName}，`,
      body: earlyMode
        ? [
            "我是卡皮巴拉。Hello.",
            "你今晚告诉我想知道什么，我夜里去找。",
            "明晚 20:30 左右，我会带着一封 letter 回来。",
          ]
        : [
            "我是卡皮巴拉。从今晚开始，你把想知道的主题交给我，我夜里会出去找线索。",
            "等到明晚 20:30 左右，我会把找到的内容装进一封 **letter** 里寄回来。你可以把我当成 travelling **friend**。",
            "如果你准备好了，就在下面告诉我：明天最想听什么主题？",
          ],
      signoff: "在收信台边等你的卡皮巴拉",
      postscript: "P.S. 你只要说出一个主题，我就会真的出发去找。",
    },
    messages: [
      {
        id: "msg-1",
        speaker: "capybara",
        text: "Hello，我已经在这里等你把明天想听的主题告诉我了。",
      },
      {
        id: "msg-2",
        speaker: "narrator",
        text: "今晚先许愿，明天卡皮巴拉就会把第一封真正的信送回来。",
      },
    ],
    task: {
      promptZh: "明天卡皮巴拉会带什么回来？",
      instructionZh: "选出最对的一项。",
      vocabulary: ["hello", "friend", "letter"],
      rewardText: "答对啦，卡皮巴拉明天会带一封信回来。",
      choices: [
        {
          id: "choice-1",
          label: "一封信",
          feedback: "对啦，明天会收到一封 letter。",
          correct: true,
        },
        {
          id: "choice-2",
          label: "一张试卷",
          feedback: "不是试卷，是一封信。",
          correct: false,
        },
        {
          id: "choice-3",
          label: "一把雨伞",
          feedback: "不是雨伞，是一封信。",
          correct: false,
        },
      ],
    },
    suggestedReply: "明天我想听海洋/森林/星空的故事。",
  };
}
