"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PDF_FILE_PATH = "/pdf/document.pdf";

type PdfViewport = {
  width: number;
  height: number;
  transform: number[];
};
type PdfTextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
};
type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: { canvas: HTMLCanvasElement; viewport: PdfViewport }) => PdfRenderTask;
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
};
type PdfRenderTask = {
  promise: Promise<void>;
  cancel: () => void;
};
type PdfDocument = {
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => void | Promise<void>;
};
type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy: () => void;
};
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  Util: { transform: (first: number[], second: number[]) => number[] };
  getDocument: (src: string) => PdfLoadingTask;
};

type MatchRule = {
  text: string;
  occurrence: "first" | "all";
  wholeWord?: boolean;
};

type DefinitionInteractionConfig = {
  id: string;
  type: "definition";
  match: MatchRule;
  title: string;
  description: string;
  color?: string;
};

type ChoiceInteractionConfig = {
  id: string;
  type: "choice";
  groupId: string;
  match: MatchRule;
  isCorrect: boolean;
};

type InteractionConfig = DefinitionInteractionConfig | ChoiceInteractionConfig;

type TextSegment = {
  text: string;
  lowerText: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Anchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MappedDefinition = {
  config: DefinitionInteractionConfig;
  anchors: Anchor[];
};

type MappedChoice = {
  config: ChoiceInteractionConfig;
  anchor: Anchor;
};

type InteractionMapping = {
  definitions: MappedDefinition[];
  choices: MappedChoice[];
};

const INTERACTION_CONFIG: InteractionConfig[] = [
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

function isAsciiLetter(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function findMatchIndices(source: string, target: string, wholeWord: boolean): number[] {
  const indices: number[] = [];
  if (!target) {
    return indices;
  }

  let from = 0;
  while (from < source.length) {
    const index = source.indexOf(target, from);
    if (index === -1) {
      break;
    }

    if (!wholeWord) {
      indices.push(index);
      from = index + target.length;
      continue;
    }

    const before = source[index - 1];
    const after = source[index + target.length];
    const valid = !isAsciiLetter(before) && !isAsciiLetter(after);
    if (valid) {
      indices.push(index);
    }
    from = index + target.length;
  }

  return indices;
}

function createTextSegments(
  items: PdfTextItem[],
  viewport: PdfViewport,
  scale: number,
  pdfjsLib: PdfJsModule,
): TextSegment[] {
  return items
    .filter((item) => typeof item.str === "string" && item.str.length > 0)
    .map((item) => {
      const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.hypot(transform[2], transform[3]);
      return {
        text: item.str,
        lowerText: item.str.toLowerCase(),
        x: transform[4],
        y: transform[5] - fontSize,
        width: Math.max(item.width * scale, 1),
        height: Math.max(fontSize, item.height),
      };
    });
}

function mapRuleToAnchors(segments: TextSegment[], rule: MatchRule): Anchor[] {
  const target = rule.text.toLowerCase();
  const matched: Anchor[] = [];

  for (const segment of segments) {
    const indices = findMatchIndices(segment.lowerText, target, Boolean(rule.wholeWord));
    if (indices.length === 0) {
      continue;
    }

    const safeLen = Math.max(segment.text.length, 1);
    for (const startIndex of indices) {
      const startRatio = startIndex / safeLen;
      const endRatio = (startIndex + target.length) / safeLen;
      matched.push({
        x: segment.x + segment.width * startRatio,
        y: segment.y,
        width: Math.max(segment.width * (endRatio - startRatio), 1),
        height: segment.height,
      });
    }
  }

  if (rule.occurrence === "first") {
    return matched.length > 0 ? [matched[0]] : [];
  }
  return matched;
}

function buildInteractionMapping(segments: TextSegment[], config: InteractionConfig[]): InteractionMapping {
  const definitions: MappedDefinition[] = [];
  const choices: MappedChoice[] = [];

  for (const entry of config) {
    const anchors = mapRuleToAnchors(segments, entry.match);
    if (anchors.length === 0) {
      continue;
    }

    if (entry.type === "definition") {
      definitions.push({
        config: entry,
        anchors,
      });
      continue;
    }

    choices.push({
      config: entry,
      anchor: anchors[0],
    });
  }

  return { definitions, choices };
}

function PdfReader({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfjsLibRef = useRef<PdfJsModule | null>(null);
  const pdfDocRef = useRef<PdfDocument | null>(null);
  const pdfLoadingTaskRef = useRef<PdfLoadingTask | null>(null);
  const activeRenderTaskRef = useRef<PdfRenderTask | null>(null);
  const lastRenderKeyRef = useRef("");
  const initialFitScaleRef = useRef<number | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [documentVersion, setDocumentVersion] = useState(0);
  const [mapping, setMapping] = useState<InteractionMapping>({ definitions: [], choices: [] });
  const [openDefinitionKeys, setOpenDefinitionKeys] = useState<Record<string, boolean>>({});
  const [quizSelectionByGroup, setQuizSelectionByGroup] = useState<Record<string, string>>({});
  const zoomLevel = 1;
  const [canvasDisplayWidth, setCanvasDisplayWidth] = useState(0);
  const [renderPixelRatio, setRenderPixelRatio] = useState(1);

  const choiceSummary = useMemo(() => {
    const byGroup = new Map<string, MappedChoice[]>();
    for (const choice of mapping.choices) {
      const groupChoices = byGroup.get(choice.config.groupId) ?? [];
      groupChoices.push(choice);
      byGroup.set(choice.config.groupId, groupChoices);
    }
    return byGroup;
  }, [mapping.choices]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let frameId = 0;
    const updateWidth = () => {
      const width = Math.round(container.getBoundingClientRect().width);
      setContainerWidth((current) => (current === width ? current : width));
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateWidth);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const updatePixelRatio = () => {
      const next = Math.max(1, window.devicePixelRatio || 1);
      setRenderPixelRatio((current) => (current === next ? current : next));
    };

    updatePixelRatio();
    window.addEventListener("resize", updatePixelRatio);
    return () => {
      window.removeEventListener("resize", updatePixelRatio);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    lastRenderKeyRef.current = "";
    initialFitScaleRef.current = null;
    setStatus("loading");
    setErrorMessage("");
    setMapping({ definitions: [], choices: [] });
    setOpenDefinitionKeys({});
    setQuizSelectionByGroup({});

    if (pdfLoadingTaskRef.current) {
      pdfLoadingTaskRef.current.destroy();
      pdfLoadingTaskRef.current = null;
    }
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }

    async function loadDocument() {
      if (!filePath) {
        setStatus("error");
        setErrorMessage("PDF file path is empty.");
        return;
      }

      try {
        const pdfjsLib = (await import("pdfjs-dist")) as unknown as PdfJsModule;
        pdfjsLibRef.current = pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadingTask = pdfjsLib.getDocument(filePath);
        pdfLoadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (!alive) {
          return;
        }

        pdfDocRef.current = pdf;
        setDocumentVersion((value) => value + 1);
      } catch (error) {
        if (!alive) {
          return;
        }
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load PDF.");
      }
    }

    loadDocument();

    return () => {
      alive = false;
    };
  }, [filePath]);

  useEffect(() => {
    let alive = true;

    async function renderAndMap() {
      const canvas = canvasRef.current;
      const pdf = pdfDocRef.current;
      const pdfjsLib = pdfjsLibRef.current;
      if (!canvas || !pdf || !pdfjsLib) {
        return;
      }
      if (containerWidth <= 0) {
        return;
      }

      try {
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          try {
            await activeRenderTaskRef.current.promise;
          } catch {
            // Previous render can reject after cancel; safe to ignore.
          }
          activeRenderTaskRef.current = null;
        }

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        if (initialFitScaleRef.current == null) {
          initialFitScaleRef.current = containerWidth / baseViewport.width;
        }
        const displayScale = initialFitScaleRef.current * zoomLevel;
        const renderKey = `${displayScale.toFixed(4)}-${renderPixelRatio.toFixed(2)}`;
        if (lastRenderKeyRef.current === renderKey) {
          return;
        }
        const renderScale = displayScale * renderPixelRatio;
        const displayViewport = page.getViewport({ scale: displayScale });
        const renderViewport = page.getViewport({ scale: renderScale });
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = Math.max(1, Math.round(renderViewport.width));
        offscreenCanvas.height = Math.max(1, Math.round(renderViewport.height));

        const renderTask = page.render({ canvas: offscreenCanvas, viewport: renderViewport });
        activeRenderTaskRef.current = renderTask;
        await renderTask.promise;
        if (activeRenderTaskRef.current === renderTask) {
          activeRenderTaskRef.current = null;
        }

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("PDF canvas context is not ready.");
        }

        canvas.width = offscreenCanvas.width;
        canvas.height = offscreenCanvas.height;
        canvas.style.width = `${displayViewport.width}px`;
        canvas.style.height = `${displayViewport.height}px`;
        setCanvasDisplayWidth(displayViewport.width);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(offscreenCanvas, 0, 0);
        lastRenderKeyRef.current = renderKey;

        const textContent = await page.getTextContent();
        const segments = createTextSegments(
          textContent.items,
          displayViewport,
          displayScale,
          pdfjsLib,
        );
        const nextMapping = buildInteractionMapping(segments, INTERACTION_CONFIG);
        if (!alive) {
          return;
        }
        setMapping(nextMapping);
        setStatus("ready");
      } catch (error) {
        if (!alive) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to render PDF.";
        if (message.toLowerCase().includes("cancel")) {
          return;
        }
        setStatus("error");
        setErrorMessage(message);
      }
    }

    renderAndMap();

    return () => {
      alive = false;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [containerWidth, documentVersion, zoomLevel, renderPixelRatio]);

  useEffect(() => {
    return () => {
      if (pdfLoadingTaskRef.current) {
        pdfLoadingTaskRef.current.destroy();
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, []);

  return (
    <section>
      <h2 style={{ marginBottom: "0.5rem" }}>PDF Preview</h2>
      <p style={{ marginBottom: "0.75rem" }}>Use browser zoom (Ctrl + mouse wheel) for whole-page sync.</p>
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
        <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto" }} />

        {mapping.definitions.map((entry) =>
          entry.anchors.map((anchor, index) => {
            const overlayOffsetX = Math.max((containerWidth - canvasDisplayWidth) / 2, 0);
            const key = `${entry.config.id}-${index}`;
            const isOpen = Boolean(openDefinitionKeys[key]);
            return (
              <div key={key}>
                <button
                  type="button"
                  aria-label={`Show explanation for ${entry.config.title}`}
                  onClick={() => {
                    setOpenDefinitionKeys((prev) => ({
                      ...prev,
                      [key]: !prev[key],
                    }));
                  }}
                  style={{
                    position: "absolute",
                    left: `${anchor.x + overlayOffsetX}px`,
                    top: `${anchor.y}px`,
                    width: `${anchor.width}px`,
                    height: `${anchor.height}px`,
                    border: "none",
                    backgroundColor: entry.config.color ?? "rgba(11, 87, 208, 0.15)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                {isOpen && (
                  <div
                    role="dialog"
                    aria-live="polite"
                    style={{
                      position: "absolute",
                      left: `${anchor.x + overlayOffsetX}px`,
                      top: `${Math.max(anchor.y - 94 * zoomLevel, 8)}px`,
                      width: `${Math.max(anchor.width + 180 * zoomLevel, 220 * zoomLevel)}px`,
                      background: "#fff",
                      border: "1px solid #1f1f1f",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                      zIndex: 10,
                    }}
                  >
                    <div
                      style={{
                        padding: `${0.5 * zoomLevel}rem ${0.65 * zoomLevel}rem`,
                        borderBottom: "1px solid #ddd",
                        fontWeight: 700,
                        fontSize: `${Math.max(12, 16 * zoomLevel)}px`,
                        textTransform: "capitalize",
                      }}
                    >
                      {entry.config.title}
                    </div>
                    <div
                      style={{
                        padding: `${0.55 * zoomLevel}rem ${0.65 * zoomLevel}rem`,
                        lineHeight: 1.35,
                        fontSize: `${Math.max(12, 14 * zoomLevel)}px`,
                      }}
                    >
                      {entry.config.description}
                    </div>
                  </div>
                )}
              </div>
            );
          }),
        )}

        {mapping.choices.map((choice) => {
          const overlayOffsetX = Math.max((containerWidth - canvasDisplayWidth) / 2, 0);
          const { groupId } = choice.config;
          const selectedId = quizSelectionByGroup[groupId];
          const isLocked = Boolean(selectedId);
          const isSelected = selectedId === choice.config.id;
          const marker = isSelected ? (choice.config.isCorrect ? "O" : "X") : "";

          return (
            <button
              key={choice.config.id}
              type="button"
              aria-label={`Select ${choice.config.match.text}`}
              onClick={() => {
                if (isLocked) {
                  return;
                }
                setQuizSelectionByGroup((prev) => ({
                  ...prev,
                  [groupId]: choice.config.id,
                }));
              }}
              style={{
                position: "absolute",
                left: `${choice.anchor.x + overlayOffsetX}px`,
                top: `${choice.anchor.y}px`,
                width: `${choice.anchor.width}px`,
                height: `${choice.anchor.height}px`,
                border: "1px solid transparent",
                backgroundColor: "transparent",
                cursor: isLocked ? "default" : "pointer",
                padding: 0,
                zIndex: 12,
              }}
              title={`Option: ${choice.config.match.text}`}
            >
              {isSelected && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                    fontSize: `${Math.max(14, 20 * zoomLevel)}px`,
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
        <h3>Configuration-Driven Results</h3>
        {mapping.definitions.length === 0 && mapping.choices.length === 0 && status === "ready" && (
          <p>No configured targets were found on page 1.</p>
        )}
        {mapping.definitions.length > 0 && (
          <ul>
            {mapping.definitions.map((entry) => (
              <li key={entry.config.id}>
                Definition target {entry.config.match.text} matched {entry.anchors.length} time(s)
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h3>Single-Choice Questions</h3>
        {[...choiceSummary.entries()].map(([groupId, choices]) => {
          const selectedId = quizSelectionByGroup[groupId];
          const selectedChoice = choices.find((item) => item.config.id === selectedId);
          return (
            <div key={groupId} style={{ marginBottom: "0.8rem" }}>
              <p style={{ margin: "0.35rem 0" }}>
                Group <strong>{groupId}</strong>: choose one option.
              </p>
                <p style={{ margin: "0.35rem 0" }}>
                  {selectedChoice == null && "No option selected yet."}
                  {selectedChoice != null &&
                    (selectedChoice.config.isCorrect
                    ? `Selected ${selectedChoice.config.match.text}: correct.`
                    : `Selected ${selectedChoice.config.match.text}: incorrect.`)}
                </p>
              {selectedChoice != null && (
                <p style={{ margin: "0.35rem 0", fontWeight: 600 }}>
                  Selection is final. Remaining options are locked.
                </p>
              )}
            </div>
          );
        })}
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
