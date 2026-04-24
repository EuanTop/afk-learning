import type { StoryWordCard, StoryWordRating } from "@capybara-letter/shared";

type ReviewPageProps = {
  wordBank: StoryWordCard[];
  onRate: (cardId: string, rating: StoryWordRating) => void;
  onBack: () => void;
  onViewLetter?: (deliveryId: string) => void;
};

function isDue(card: StoryWordCard): boolean {
  return new Date(card.scheduler.due).getTime() <= Date.now();
}

const RATING_BUTTONS: Array<{ rating: StoryWordRating; label: string; color: string }> = [
  { rating: "again", label: "再看看", color: "bg-[#ffdacc]" },
  { rating: "hard", label: "有点难", color: "bg-[#ffe8b3]" },
  { rating: "good", label: "记住啦", color: "bg-[#d7f1c5]" },
  { rating: "easy", label: "太会了", color: "bg-[#cfe7ff]" },
];

function panelClass() {
  return "rounded-[1.9rem] border-4 border-stone-900 bg-[#fff8ea]/96 p-5 shadow-[8px_8px_0_0_#2b2118]";
}

export function ReviewPage({ wordBank, onRate, onBack, onViewLetter }: ReviewPageProps) {
  const dueCards = wordBank.filter(isDue);
  const reviewedCount = wordBank.length - dueCards.length;

  if (dueCards.length === 0) {
    return (
      <main className="min-h-dvh bg-[linear-gradient(180deg,#bfd7f5_0%,#d7e6fa_42%,#f4e4cf_100%)] px-4 py-6 text-stone-900 sm:px-6">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-2xl flex-col items-center justify-center text-center">
          <section className={panelClass()}>
            <div className="text-5xl">📚</div>
            <h2 className="mt-4 text-2xl font-black">现在没有到期词卡</h2>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              这轮你已经复习完了。等卡皮巴拉下一封信送来，新的单词会继续进入这里。
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 rounded-full border-4 border-stone-900 bg-[#ffcf6e] px-5 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118]"
            >
              回到收信台
            </button>
          </section>
        </div>
      </main>
    );
  }

  const card = dueCards[0];

  return (
    <main className="min-h-dvh bg-[linear-gradient(180deg,#bfd7f5_0%,#d7e6fa_42%,#f4e4cf_100%)] px-4 py-4 text-stone-900 sm:px-6 sm:py-6">
      <header className="mx-auto flex max-w-4xl items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border-4 border-stone-900 bg-[#fff8e8] px-4 py-2 text-sm font-black shadow-[4px_4px_0_0_#2b2118]"
        >
          ← 返回
        </button>
        <section className="max-w-[min(72vw,20rem)] rounded-[1.7rem] border-4 border-stone-900 bg-[#fff8e6]/86 px-4 py-3 text-right shadow-[8px_8px_0_0_#2b2118]">
          <h1 className="text-xl font-black">词卡复习</h1>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            到期 {dueCards.length} 张，已累计 {reviewedCount} 张完成复习。
          </p>
        </section>
      </header>

      <div className="mx-auto mt-6 flex max-w-4xl flex-col gap-5 lg:flex-row">
        <section className={[panelClass(), "flex-1"].join(" ")}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">当前词卡</div>
          <div className="mt-4 rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-3xl font-black">{card.word}</div>
            {card.pronunciation ? (
              <div className="mt-1 text-sm font-semibold text-stone-500">{card.pronunciation}</div>
            ) : null}
            <div className="mt-4 text-base font-semibold text-stone-800">{card.meaningZh}</div>
            {card.example ? (
              <div className="mt-4 rounded-[1rem] bg-[#fff4d1] px-3 py-3 text-sm leading-7 text-stone-700">
                {card.example}
                {card.exampleZh ? (
                  <div className="mt-1 text-xs leading-6 text-stone-500">{card.exampleZh}</div>
                ) : null}
              </div>
            ) : null}
            {card.tapHint ? (
              <div className="mt-3 text-sm font-semibold text-stone-500">{card.tapHint}</div>
            ) : null}

            {onViewLetter && card.sourceTitle && card.sourceDeliveryId ? (
              <button
                type="button"
                onClick={() => onViewLetter(card.sourceDeliveryId!)}
                className="mt-4 rounded-full border-4 border-stone-900 bg-[#fff8e8] px-4 py-2 text-xs font-black shadow-[3px_3px_0_0_#2b2118]"
              >
                查看原信：{card.sourceTitle}
              </button>
            ) : null}
          </div>
        </section>

        <section className={[panelClass(), "w-full lg:w-[22rem]"].join(" ")}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">记忆程度</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {RATING_BUTTONS.map(({ rating, label, color }) => (
              <button
                key={rating}
                type="button"
                onClick={() => onRate(card.id, rating)}
                className={`rounded-[1rem] border-4 border-stone-900 px-3 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition hover:brightness-[1.02] ${color}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
