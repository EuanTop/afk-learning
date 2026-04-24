import type { VocabularyCard } from "@capybara-letter/shared";

type LetterBodyProps = {
  paragraphs: string[];
  vocabularyCards?: VocabularyCard[];
  onWordTap?: (word: string) => void;
};

type TextSegment = { type: "text"; content: string } | { type: "bold"; content: string };

function parseBoldSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "bold", content: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

export function LetterBody({ paragraphs, vocabularyCards, onWordTap }: LetterBodyProps) {
  const vocabWords = new Set(
    (vocabularyCards ?? []).map((c) => c.word.toLowerCase()),
  );

  return (
    <div className="space-y-3 text-[0.95rem] leading-8 text-stone-700">
      {paragraphs.map((paragraph, pIndex) => {
        const segments = parseBoldSegments(paragraph);
        return (
          <p key={pIndex}>
            {segments.map((seg, sIndex) => {
              if (seg.type === "text") {
                return <span key={sIndex}>{seg.content}</span>;
              }
              const isVocab = vocabWords.has(seg.content.toLowerCase());
              if (isVocab && onWordTap) {
                return (
                  <button
                    key={sIndex}
                    type="button"
                    className="mx-0.5 inline rounded-lg border-2 border-amber-400 bg-amber-50 px-1.5 py-0.5 font-black text-stone-900 transition hover:bg-amber-100 hover:border-amber-500"
                    onClick={() => onWordTap(seg.content)}
                  >
                    {seg.content}
                  </button>
                );
              }
              return (
                <strong key={sIndex} className="font-black text-stone-900">
                  {seg.content}
                </strong>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
