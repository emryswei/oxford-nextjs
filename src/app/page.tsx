"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

const PDF_FILE_PATH = "/pdf/document.pdf";
const TARGET_WORDS = ["optimistic", "duration"] as const;
const QUIZ_WORDS = ["minutes", "minute"] as const;
type TargetWord = (typeof TARGET_WORDS)[number];
type QuizWord = (typeof QUIZ_WORDS)[number];
type WordPosition = {
  word: TargetWord;
  x: number;
  y: number;
  width: number;
  height: number;
};
type QuizPosition = {
  word: QuizWord;
  x: number;
  y: number;
  width: number;
  height: number;
};

const WORD_EXPLANATION: Record<TargetWord, string> = {
  optimistic: "Feeling hopeful and confident that good things will happen.",
  duration: "The length of time that something continues.",
};

function isLetter(char: string | undefined): boolean {
  return !!char && char >= "a" && char <= "z";
}

function findWholeWordIndices(line: string, word: string): number[] {
  const found: number[] = [];
  let fromIndex = 0;

  while (fromIndex < line.length) {
    const index = line.indexOf(word, fromIndex);
    if (index === -1) {
      break;
    }

    const before = line[index - 1];
    const after = line[index + word.length];
    const isWholeWord = !isLetter(before) && !isLetter(after);

    if (isWholeWord) {
      found.push(index);
    }

    fromIndex = index + word.length;
  }

  return found;
}

function PdfReader({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [positions, setPositions] = useState<WordPosition[]>([]);
  const [quizPositions, setQuizPositions] = useState<QuizPosition[]>([]);
  const [openPopupKeys, setOpenPopupKeys] = useState<Record<string, boolean>>({});
  const [selectedQuizWord, setSelectedQuizWord] = useState<QuizWord | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(container.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let destroyed = false;

    async function loadPdf() {
      const canvas = canvasRef.current;

      if (!canvas) {
        setStatus("error");
        setErrorMessage("PDF canvas is not ready.");
        return;
      }

      if (!filePath) {
        setStatus("error");
        setErrorMessage("PDF file path is empty.");
        return;
      }
      if (containerWidth <= 0) {
        return;
      }

      try {
        setStatus("loading");
        setErrorMessage("");

        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;
        if (!isMounted || destroyed) {
          return;
        }

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({
          canvas,
          viewport,
        });
        await renderTask.promise;

        const textContent = await page.getTextContent();
        const foundPositions: WordPosition[] = [];
        const firstQuizByWord: Partial<Record<QuizWord, QuizPosition>> = {};

        for (const item of textContent.items) {
          if (!("str" in item)) {
            continue;
          }

          const rawText = String(item.str);
          const lowerRaw = rawText.toLowerCase();

          const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontSize = Math.hypot(transform[2], transform[3]);
          const lineX = transform[4];
          const y = transform[5] - fontSize;
          const lineWidth = Math.max(item.width * scale, 1);
          const height = Math.max(fontSize, item.height);
          const safeLength = Math.max(rawText.length, 1);

          for (const target of TARGET_WORDS) {
            let fromIndex = 0;

            while (fromIndex < lowerRaw.length) {
              const matchIndex = lowerRaw.indexOf(target, fromIndex);
              if (matchIndex === -1) {
                break;
              }

              const startRatio = matchIndex / safeLength;
              const endRatio = (matchIndex + target.length) / safeLength;
              const x = lineX + lineWidth * startRatio;
              const width = Math.max(lineWidth * (endRatio - startRatio), 1);

              foundPositions.push({
                word: target,
                x,
                y,
                width,
                height,
              });

              fromIndex = matchIndex + target.length;
            }
          }

          for (const quizWord of QUIZ_WORDS) {
            if (firstQuizByWord[quizWord]) {
              continue;
            }

            const indices = findWholeWordIndices(lowerRaw, quizWord);
            if (indices.length === 0) {
              continue;
            }

            const matchIndex = indices[0];
            const startRatio = matchIndex / safeLength;
            const endRatio = (matchIndex + quizWord.length) / safeLength;
            const x = lineX + lineWidth * startRatio;
            const width = Math.max(lineWidth * (endRatio - startRatio), 1);

            firstQuizByWord[quizWord] = {
              word: quizWord,
              x,
              y,
              width,
              height,
            };
          }
        }

        if (isMounted && !destroyed) {
          setPositions(foundPositions);
          setQuizPositions(
            QUIZ_WORDS.map((word) => firstQuizByWord[word]).filter(
              (item): item is QuizPosition => Boolean(item),
            ),
          );
          setOpenPopupKeys({});
          setSelectedQuizWord(null);
        }
        if (isMounted && !destroyed) {
          setStatus("ready");
        }
      } catch (error) {
        if (!isMounted || destroyed) {
          return;
        }
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load or render the PDF.",
        );
      }
    }

    loadPdf();

    return () => {
      isMounted = false;
      destroyed = true;
    };
  }, [filePath, containerWidth]);

  return (
    <section>
      <h2 style={{ marginBottom: "0.5rem" }}>PDF Preview (PDF.js)</h2>

      {status === "loading" && <p>Loading PDF...</p>}
      {status === "error" && <p style={{ color: "#b00020" }}>Error: {errorMessage}</p>}

      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          border: "1px solid #ddd",
          overflow: "auto",
        }}
      >
        <canvas ref={canvasRef} />
        {positions.map((position, index) => (
          <div key={`${position.word}-${index}`}>
            <button
            type="button"
            aria-label={`Show explanation for ${position.word}`}
            onClick={() => {
              const popupKey = `${position.word}-${index}`;
              setOpenPopupKeys((current) => ({
                ...current,
                [popupKey]: !current[popupKey],
              }));
            }}
            style={{
              position: "absolute",
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${position.width}px`,
              height: `${position.height}px`,
              border: "none",
              backgroundColor: "rgba(11, 87, 208, 0.15)",
              // backgroundColor: "transparent",
              cursor: "pointer",
              padding: 0,
            }}
          />
            {openPopupKeys[`${position.word}-${index}`] && (
              <div
                role="dialog"
                aria-live="polite"
                style={{
                  position: "absolute",
                  left: `${position.x}px`,
                  top: `${Math.max(position.y - 94, 8)}px`,
                  width: `${Math.max(position.width + 180, 220)}px`,
                  background: "#fff",
                  border: "1px solid #1f1f1f",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    padding: "0.5rem 0.65rem",
                    borderBottom: "1px solid #ddd",
                    fontWeight: 700,
                    textTransform: "capitalize",
                  }}
                >
                  {position.word}
                </div>
                <div style={{ padding: "0.55rem 0.65rem", lineHeight: 1.35 }}>
                  {WORD_EXPLANATION[position.word]}
                </div>
              </div>
            )}
          </div>
        ))}

        {quizPositions.map((position) => {
          const isSelected = selectedQuizWord === position.word;
          const isLocked = selectedQuizWord !== null;
          const isCorrect = position.word === "minutes";
          const marker = isSelected ? (isCorrect ? "✅" : "❌") : "";

          return (
            <button
              key={`quiz-${position.word}`}
              type="button"
              aria-label={`Select ${position.word}`}
              onClick={() => {
                if (!isLocked) {
                  setSelectedQuizWord(position.word);
                }
              }}
              style={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${position.width}px`,
                height: `${position.height}px`,
                border: "1px solid transparent",
                backgroundColor: "transparent",
                cursor: isLocked ? "default" : "pointer",
                padding: 0,
                zIndex: 12,
              }}
              title={`Option: ${position.word}`}
            >
              {isSelected && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                    fontSize: "20px",
                    lineHeight: 1,
                  }}
                >
                  {marker}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section style={{ marginTop: "1rem" }}>
        <h3>Located Word Positions (Page 1)</h3>
        {positions.length === 0 && status === "ready" && <p>No target words found.</p>}
        {positions.length > 0 && (
          <ul>
            {positions.map((position, index) => (
              <li key={`${position.word}-list-${index}`}>
                {position.word}: x={position.x.toFixed(1)}, y={position.y.toFixed(1)}, width=
                {position.width.toFixed(1)}, height={position.height.toFixed(1)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h3>Single-Choice Question</h3>
        <p style={{ margin: "0.35rem 0" }}>
          Select the correct word: <strong>minutes</strong> (correct) or{" "}
          <strong>minute</strong> (wrong).
        </p>
        <p style={{ margin: "0.35rem 0" }}>
          {selectedQuizWord === null && "No option selected yet."}
          {selectedQuizWord === "minutes" && "You selected minutes: correct (✅)."}
          {selectedQuizWord === "minute" && "You selected minute: incorrect (❌)."}
        </p>
        {selectedQuizWord !== null && (
          <p style={{ margin: "0.35rem 0", fontWeight: 600 }}>
            Selection is final. The other option is now locked.
          </p>
        )}
      </section>
    </section>
  );
}

export default function Home() {
  return (
    <main style={{ padding: "1rem" }}>
      <h1>PDF Reader</h1>
      <PdfReader filePath={PDF_FILE_PATH} />
    </main>
  );
}
