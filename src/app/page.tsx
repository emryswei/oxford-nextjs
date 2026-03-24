"use client";

import { useEffect, useRef, useState } from "react";

import {
  type ChoiceInteractionConfig,
  type DefinitionInteractionConfig,
  INTERACTION_CONFIG,
} from "@/lib/pdf-interactions";

const PDF_FILE_PATH = "/pdf/document.pdf";
const PAGE_NUMBER = 1;

type PdfViewport = {
  width: number;
  height: number;
};

type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: { canvas: HTMLCanvasElement; viewport: PdfViewport }) => PdfRenderTask;
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
  getDocument: (src: string) => PdfLoadingTask;
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

type PdfIndexResponse = {
  pageNumber: number;
  basePageWidth: number;
  basePageHeight: number;
  anchorsByRuleId: Record<string, Anchor[]>;
};

function scaleAnchor(anchor: Anchor, scale: number): Anchor {
  return {
    x: anchor.x * scale,
    y: anchor.y * scale,
    width: anchor.width * scale,
    height: anchor.height * scale,
  };
}

function buildInteractionMapping(
  anchorsByRuleId: Record<string, Anchor[]>,
  displayScale: number,
): InteractionMapping {
  const definitions: MappedDefinition[] = [];
  const choices: MappedChoice[] = [];

  for (const entry of INTERACTION_CONFIG) {
    const baseAnchors = anchorsByRuleId[entry.id] ?? [];
    if (baseAnchors.length === 0) {
      continue;
    }

    if (entry.type === "definition") {
      definitions.push({
        config: entry,
        anchors: baseAnchors.map((anchor) => scaleAnchor(anchor, displayScale)),
      });
      continue;
    }

    choices.push({
      config: entry,
      anchor: scaleAnchor(baseAnchors[0], displayScale),
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
  
  const [containerWidth, setContainerWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [documentVersion, setDocumentVersion] = useState(0);
  const [mapping, setMapping] = useState<InteractionMapping>({ definitions: [], choices: [] });
  const [openDefinitionKeys, setOpenDefinitionKeys] = useState<Record<string, boolean>>({});
  const [quizSelectionByGroup, setQuizSelectionByGroup] = useState<Record<string, string>>({});
  const [canvasDisplayWidth, setCanvasDisplayWidth] = useState(0);
  const [renderPixelRatio, setRenderPixelRatio] = useState(1);
  const [anchorsByRuleId, setAnchorsByRuleId] = useState<Record<string, Anchor[]>>({});
  const [basePageWidth, setBasePageWidth] = useState(0);

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
    window.addEventListener("resize", updateWidth);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
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
    const abortController = new AbortController();
    lastRenderKeyRef.current = "";
    setStatus("loading");
    setErrorMessage("");
    setMapping({ definitions: [], choices: [] });
    setAnchorsByRuleId({});
    setBasePageWidth(0);
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

    async function loadDocumentAndIndex() {
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

        const indexPromise = fetch("/api/pdf-index", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filePath,
            pageNumber: PAGE_NUMBER,
            rules: INTERACTION_CONFIG.map((entry) => ({
              id: entry.id,
              match: entry.match,
            })),
          }),
          signal: abortController.signal,
        });

        const [pdf, indexResponse] = await Promise.all([loadingTask.promise, indexPromise]);
        if (!alive) {
          return;
        }
        pdfDocRef.current = pdf;

        let indexData: PdfIndexResponse | null = null;
        if (indexResponse.ok) {
          indexData = (await indexResponse.json()) as PdfIndexResponse;
        } else {
          console.warn(`PDF index request failed (${indexResponse.status}); using client fallback.`);
        }

        if (!alive) {
          return;
        }

        const page = await pdf.getPage(PAGE_NUMBER);
        const fallbackViewport = page.getViewport({ scale: 1 });

        setAnchorsByRuleId(indexData?.anchorsByRuleId ?? {});
        setBasePageWidth(
          indexData?.basePageWidth && indexData.basePageWidth > 0
            ? indexData.basePageWidth
            : fallbackViewport.width,
        );
        setDocumentVersion((value) => value + 1);
      } catch (error) {
        if (!alive) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load PDF.");
      }
    }

    loadDocumentAndIndex();

    return () => {
      alive = false;
      abortController.abort();
    };
  }, [filePath]);

  useEffect(() => {
    let alive = true;

    async function renderPdfAndApplyMapping() {
      const canvas = canvasRef.current;
      const pdf = pdfDocRef.current;
      if (!canvas || !pdf) {
        return;
      }
      if (containerWidth <= 0 || basePageWidth <= 0) {
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

        const page = await pdf.getPage(PAGE_NUMBER);
        const displayScale = containerWidth / basePageWidth;
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

        if (!alive) {
          return;
        }
        setMapping(buildInteractionMapping(anchorsByRuleId, displayScale));
        setStatus("ready");
      } catch (error) {
        if (!alive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to render PDF.";
        if (message.toLowerCase().includes("cancel")) {
          return;
        }
        setStatus("error");
        setErrorMessage(message);
      }
    }

    renderPdfAndApplyMapping();

    return () => {
      alive = false;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [anchorsByRuleId, basePageWidth, containerWidth, documentVersion, renderPixelRatio]);

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
      <h2 style={{ marginBottom: "0.5rem" }}>PDF Preview (Backend Indexed)</h2>
      <p style={{ marginBottom: "0.75rem" }}>
        PDF text anchors are indexed by backend API for better scalability.
      </p>
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
                      top: `${Math.max(anchor.y - 94, 8)}px`,
                      width: `${Math.max(anchor.width + 180, 220)}px`,
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
                      {entry.config.title}
                    </div>
                    <div style={{ padding: "0.55rem 0.65rem", lineHeight: 1.35 }}>
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
    </section>
  );
}

export default function Home() {
  return (
    <main style={{ padding: "1rem" }}>
      <PdfReader filePath={PDF_FILE_PATH} />
    </main>
  );
}






