"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  deleteScratchpad,
  loadScratchpad,
  saveScratchpad,
  type ScratchpadPoint,
  type ScratchpadStroke,
  type ScratchpadTool,
} from "../lib/scratchpad-db";

type PencilScratchpadProps = {
  storageKey: string;
};

const PEN_COLORS = [
  { value: "#1f2937", label: "검정" },
  { value: "#2563eb", label: "파랑" },
  { value: "#dc2626", label: "빨강" },
] as const;

const PEN_WIDTH = 3.2;
const ERASER_WIDTH = 26;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointWidth(stroke: ScratchpadStroke, pressure: number): number {
  const normalizedPressure = clamp(pressure || 0.5, 0.08, 1);
  if (stroke.tool === "eraser") return stroke.width * (0.7 + normalizedPressure * 0.55);
  return stroke.width * (0.48 + normalizedPressure * 0.92);
}

function strokeBounds(aspectRatio: number, width: number, height: number) {
  const currentAspect = width / height;
  const sourceAspect = aspectRatio > 0 ? aspectRatio : currentAspect;
  if (currentAspect > sourceAspect) {
    const drawWidth = height * sourceAspect;
    return { x: (width - drawWidth) / 2, y: 0, width: drawWidth, height };
  }
  const drawHeight = width / sourceAspect;
  return { x: 0, y: (height - drawHeight) / 2, width, height: drawHeight };
}

function canvasPoint(
  point: ScratchpadPoint,
  bounds: ReturnType<typeof strokeBounds>,
) {
  return {
    x: bounds.x + point.x * bounds.width,
    y: bounds.y + point.y * bounds.height,
  };
}

function prepareStrokeContext(
  context: CanvasRenderingContext2D,
  stroke: ScratchpadStroke,
) {
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function drawPaper(
  context: CanvasRenderingContext2D,
  pageAspectRatio: number,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  const bounds = strokeBounds(pageAspectRatio, width, height);
  context.save();
  context.fillStyle = "#fffefa";
  context.shadowColor = "rgba(31, 41, 55, 0.12)";
  context.shadowBlur = 10;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(99, 117, 136, 0.12)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = bounds.x + 24; x < bounds.x + bounds.width; x += 24) {
    context.moveTo(x, bounds.y);
    context.lineTo(x, bounds.y + bounds.height);
  }
  for (let y = bounds.y + 24; y < bounds.y + bounds.height; y += 24) {
    context.moveTo(bounds.x, y);
    context.lineTo(bounds.x + bounds.width, y);
  }
  context.stroke();
  context.restore();
}

function drawStrokeSegment(
  context: CanvasRenderingContext2D,
  stroke: ScratchpadStroke,
  previous: ScratchpadPoint,
  current: ScratchpadPoint,
  width: number,
  height: number,
  pageAspectRatio: number,
): void {
  const bounds = strokeBounds(pageAspectRatio, width, height);
  const start = canvasPoint(previous, bounds);
  const end = canvasPoint(current, bounds);
  context.save();
  prepareStrokeContext(context, stroke);
  context.lineWidth = pointWidth(stroke, (previous.pressure + current.pressure) / 2);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: ScratchpadStroke,
  width: number,
  height: number,
  pageAspectRatio: number,
): void {
  const points = stroke.points;
  if (!points.length || width <= 0 || height <= 0) return;
  const bounds = strokeBounds(pageAspectRatio, width, height);

  context.save();
  prepareStrokeContext(context, stroke);

  if (points.length === 1) {
    const point = points[0];
    const mappedPoint = canvasPoint(point, bounds);
    context.beginPath();
    context.arc(
      mappedPoint.x,
      mappedPoint.y,
      pointWidth(stroke, point.pressure) / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const start = canvasPoint(previous, bounds);
    const end = canvasPoint(current, bounds);
    context.lineWidth = pointWidth(stroke, (previous.pressure + current.pressure) / 2);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function createStroke(
  tool: ScratchpadTool,
  color: string,
  aspectRatio: number,
): ScratchpadStroke {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    tool,
    color,
    width: tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH,
    aspectRatio,
    points: [],
  };
}

export function PencilScratchpad({ storageKey }: PencilScratchpadProps) {
  const canvasRegionId = useId();
  const helpId = useId();
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<ScratchpadStroke[]>([]);
  const activeStrokeRef = useRef<ScratchpadStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string | null>(null);
  const captureSucceededRef = useRef(false);
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const pageAspectRatioRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);

  const [strokes, setStrokes] = useState<ScratchpadStroke[]>([]);
  const [tool, setTool] = useState<ScratchpadTool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0].value);
  const [inkingEnabled, setInkingEnabled] = useState(true);
  const [allowTouch, setAllowTouch] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const tabletWithTouch = window.matchMedia(
      "(min-width: 721px) and (max-width: 1366px) and (any-pointer: coarse)",
    );
    const frame = window.requestAnimationFrame(() => {
      if (tabletWithTouch.matches) setIsOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const backgroundCanvas = backgroundCanvasRef.current;
    const backgroundContext = backgroundCanvas?.getContext("2d") ?? null;
    const { width, height, dpr } = canvasSizeRef.current;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pageAspectRatio = pageAspectRatioRef.current ?? (height > 0 ? width / height : 1);
    if (backgroundCanvas && backgroundContext) {
      backgroundContext.save();
      backgroundContext.setTransform(1, 0, 0, 1, 0, 0);
      backgroundContext.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
      backgroundContext.restore();
      backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPaper(backgroundContext, pageAspectRatio, width, height);
    }
    for (const stroke of strokesRef.current) {
      drawStroke(context, stroke, width, height, pageAspectRatio);
    }
    if (activeStrokeRef.current) {
      drawStroke(context, activeStrokeRef.current, width, height, pageAspectRatio);
    }
  }, []);

  useEffect(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
    captureSucceededRef.current = false;
    pageAspectRatioRef.current = null;
    strokesRef.current = [];
    renderCanvas();

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || generation !== loadGenerationRef.current) return;
      setStrokes([]);
      setIsLoading(true);
      setErrorMessage(null);
    });
    void loadScratchpad(storageKey)
      .then((storedStrokes) => {
        if (cancelled || generation !== loadGenerationRef.current) return;
        strokesRef.current = storedStrokes;
        pageAspectRatioRef.current =
          storedStrokes.find((stroke) => stroke.aspectRatio && stroke.aspectRatio > 0)?.aspectRatio ??
          null;
        setStrokes(storedStrokes);
        renderCanvas();
      })
      .catch((error: unknown) => {
        if (cancelled || generation !== loadGenerationRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : "저장된 필기를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled && generation === loadGenerationRef.current) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [renderCanvas, storageKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
      const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const backgroundCanvas = backgroundCanvasRef.current;
      if (
        backgroundCanvas &&
        (backgroundCanvas.width !== pixelWidth || backgroundCanvas.height !== pixelHeight)
      ) {
        backgroundCanvas.width = pixelWidth;
        backgroundCanvas.height = pixelHeight;
      }
      canvasSizeRef.current = { width: bounds.width, height: bounds.height, dpr };
      renderCanvas();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isOpen, renderCanvas]);

  const persist = useCallback(
    (nextStrokes: ScratchpadStroke[]) => {
      setIsSaving(true);
      setErrorMessage(null);
      void saveScratchpad(storageKey, nextStrokes)
        .catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "필기를 기기에 저장하지 못했습니다.");
        })
        .finally(() => setIsSaving(false));
    },
    [storageKey],
  );

  const eventPoint = useCallback((event: PointerEvent): ScratchpadPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const canvasBounds = canvas.getBoundingClientRect();
    if (canvasBounds.width <= 0 || canvasBounds.height <= 0) return null;
    const { width, height } = canvasSizeRef.current;
    const pageBounds = strokeBounds(
      pageAspectRatioRef.current ?? canvasBounds.width / canvasBounds.height,
      width || canvasBounds.width,
      height || canvasBounds.height,
    );
    const fallbackPressure = event.pointerType === "mouse" ? 0.5 : 0.45;
    const x = (event.clientX - canvasBounds.left - pageBounds.x) / pageBounds.width;
    const y = (event.clientY - canvasBounds.top - pageBounds.y) / pageBounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
      x,
      y,
      pressure: clamp(event.pressure > 0 ? event.pressure : fallbackPressure, 0.08, 1),
    };
  }, []);

  const discardActiveStroke = (canvas?: HTMLCanvasElement) => {
    const pointerId = activePointerIdRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
    captureSucceededRef.current = false;
    if (canvas && pointerId !== null) {
      try {
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture.
      }
    }
    renderCanvas();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isLoading || !inkingEnabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "touch" && !allowTouch) return;

    if (activePointerIdRef.current !== null) {
      if (
        event.pointerType === "pen" &&
        activePointerTypeRef.current === "touch"
      ) {
        discardActiveStroke(event.currentTarget);
      } else {
        return;
      }
    }
    event.preventDefault();

    const { width, height } = canvasSizeRef.current;
    if (pageAspectRatioRef.current === null) {
      pageAspectRatioRef.current = width > 0 && height > 0 ? width / height : 1;
    }
    const stroke = createStroke(tool, color, pageAspectRatioRef.current);
    const point = eventPoint(event.nativeEvent);
    if (!point) return;
    stroke.points.push(point);
    activeStrokeRef.current = stroke;
    activePointerIdRef.current = event.pointerId;
    activePointerTypeRef.current = event.pointerType;
    captureSucceededRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      captureSucceededRef.current = event.currentTarget.hasPointerCapture(event.pointerId);
    } catch {
      // Pointer leave below safely finishes the stroke if older Safari rejects capture.
    }
    renderCanvas();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    const coalescedEvents =
      typeof nativeEvent.getCoalescedEvents === "function"
        ? nativeEvent.getCoalescedEvents()
        : [];
    const events = coalescedEvents.length ? coalescedEvents : [nativeEvent];
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const { width, height, dpr } = canvasSizeRef.current;
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const coalescedEvent of events) {
      const point = eventPoint(coalescedEvent);
      if (!point) continue;
      const activeStroke = activeStrokeRef.current;
      const previous = activeStroke.points.at(-1);
      activeStroke.points.push(point);
      if (context && previous) {
        drawStrokeSegment(
          context,
          activeStroke,
          previous,
          point,
          width,
          height,
          pageAspectRatioRef.current ?? activeStroke.aspectRatio ?? 1,
        );
      }
    }
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId || !activeStrokeRef.current) return;
    event.preventDefault();

    const completedStroke = activeStrokeRef.current;
    const nextStrokes = [...strokesRef.current, completedStroke];
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
    captureSucceededRef.current = false;
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already have been released by the browser.
    }
    renderCanvas();
    persist(nextStrokes);
  };

  const cancelStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    discardActiveStroke(event.currentTarget);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      activePointerIdRef.current === event.pointerId &&
      !captureSucceededRef.current
    ) {
      finishStroke(event);
    }
  };

  const undo = () => {
    if (!strokesRef.current.length || isLoading) return;
    const nextStrokes = strokesRef.current.slice(0, -1);
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
    renderCanvas();
    persist(nextStrokes);
  };

  const clearAll = () => {
    if (!strokesRef.current.length || isLoading) return;
    if (!window.confirm("이 문제의 필기를 모두 지울까요?")) return;
    discardActiveStroke(canvasRef.current ?? undefined);
    strokesRef.current = [];
    pageAspectRatioRef.current = null;
    setStrokes([]);
    renderCanvas();
    setIsSaving(true);
    setErrorMessage(null);
    void deleteScratchpad(storageKey)
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "필기를 삭제하지 못했습니다.");
      })
      .finally(() => setIsSaving(false));
  };

  const toggleInking = () => {
    if (inkingEnabled) discardActiveStroke(canvasRef.current ?? undefined);
    setInkingEnabled((enabled) => !enabled);
  };

  const toggleOpen = () => {
    if (isOpen) discardActiveStroke(canvasRef.current ?? undefined);
    setIsOpen((open) => !open);
  };

  const toggleTouchInking = () => {
    if (allowTouch && activePointerTypeRef.current === "touch") {
      discardActiveStroke(canvasRef.current ?? undefined);
    }
    setAllowTouch((enabled) => !enabled);
  };

  return (
    <section
      className={`pencil-scratchpad ${inkingEnabled ? "is-inking" : "is-scroll-mode"}`}
      aria-label="문제별 필기장"
    >
      <div className="pencil-scratchpad__header">
        <div>
          <strong>필기장</strong>
          <span className="pencil-scratchpad__save-state" aria-live="polite">
            {isLoading ? "불러오는 중" : isSaving ? "저장 중" : "기기에 자동 저장"}
          </span>
        </div>
        <button
          type="button"
          className="pencil-scratchpad__collapse"
          aria-expanded={isOpen}
          aria-controls={canvasRegionId}
          onClick={toggleOpen}
        >
          {isOpen ? "필기장 접기" : "필기장 열기"}
          <span aria-hidden="true">{isOpen ? "⌃" : "⌄"}</span>
        </button>
      </div>

      {isOpen ? (
        <div id={canvasRegionId} className="pencil-scratchpad__body">
          <div className="pencil-scratchpad__toolbar" role="toolbar" aria-label="필기 도구">
            <div className="pencil-scratchpad__mode-group" aria-label="필기 입력 방식">
              <button
                type="button"
                className={inkingEnabled ? "is-active" : undefined}
                aria-pressed={inkingEnabled}
                onClick={toggleInking}
              >
                <span aria-hidden="true">{inkingEnabled ? "✎" : "↕"}</span>{" "}
                {inkingEnabled ? "필기 모드" : "스크롤 모드"}
              </button>
              <button
                type="button"
                className={allowTouch ? "is-active" : undefined}
                aria-pressed={allowTouch}
                disabled={!inkingEnabled}
                onClick={toggleTouchInking}
              >
                손가락 필기
              </button>
            </div>

            <div className="pencil-scratchpad__tool-group" aria-label="도구 선택">
              <button
                type="button"
                className={tool === "pen" ? "is-active" : undefined}
                aria-pressed={tool === "pen"}
                onClick={() => setTool("pen")}
              >
                <span aria-hidden="true">✎</span> 펜
              </button>
              <button
                type="button"
                className={tool === "eraser" ? "is-active" : undefined}
                aria-pressed={tool === "eraser"}
                onClick={() => setTool("eraser")}
              >
                <span aria-hidden="true">▱</span> 지우개
              </button>
            </div>

            <div className="pencil-scratchpad__colors" aria-label="펜 색상 선택">
              {PEN_COLORS.map((penColor) => (
                <button
                  key={penColor.value}
                  type="button"
                  className={color === penColor.value ? "is-active" : undefined}
                  aria-label={`${penColor.label} 펜`}
                  aria-pressed={color === penColor.value}
                  onClick={() => {
                    setColor(penColor.value);
                    setTool("pen");
                  }}
                >
                  <span style={{ backgroundColor: penColor.value }} aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="pencil-scratchpad__history">
              <button type="button" onClick={undo} disabled={!strokes.length || isLoading}>
                <span aria-hidden="true">↶</span> 실행 취소
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={clearAll}
                disabled={!strokes.length || isLoading}
              >
                전체 삭제
              </button>
            </div>
          </div>

          <div className="pencil-scratchpad__paper">
            <canvas
              ref={backgroundCanvasRef}
              className="pencil-scratchpad__paper-canvas"
              aria-hidden="true"
            />
            <canvas
              ref={canvasRef}
              className="pencil-scratchpad__canvas"
              aria-label="Apple Pencil, 손가락 또는 마우스로 풀이를 적는 영역"
              aria-describedby={helpId}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={cancelStroke}
              onLostPointerCapture={cancelStroke}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(event) => event.preventDefault()}
            />
            {isLoading ? <div className="pencil-scratchpad__loading">필기를 불러오고 있어요…</div> : null}
          </div>
          <p id={helpId} className="pencil-scratchpad__help">
            Apple Pencil을 우선 인식하고 압력을 반영합니다. 손가락으로 쓰려면 ‘손가락 필기’를,
            화면을 움직이려면 ‘스크롤 모드’를 선택하세요. 필기는 이 기기의 해당 문제에 자동 저장됩니다.
          </p>
          {errorMessage ? (
            <p className="pencil-scratchpad__error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <style>{`
        .pencil-scratchpad {
          width: 100%;
          overflow: hidden;
          border: 1px solid #d9e0e8;
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 12px 34px rgba(31, 41, 55, 0.08);
          color: #1f2937;
        }
        .pencil-scratchpad__header {
          min-height: 58px;
          padding: 11px 14px 11px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #e8edf2;
          background: #fbfcfd;
        }
        .pencil-scratchpad__header > div {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }
        .pencil-scratchpad__header strong { font-size: 1rem; }
        .pencil-scratchpad__save-state {
          color: #6b7280;
          font-size: 0.78rem;
          white-space: nowrap;
        }
        .pencil-scratchpad button {
          min-height: 38px;
          border: 1px solid #d6dde6;
          border-radius: 10px;
          padding: 7px 11px;
          background: #ffffff;
          color: #374151;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          touch-action: manipulation;
        }
        .pencil-scratchpad button:hover:not(:disabled) { background: #f4f7fa; }
        .pencil-scratchpad button:focus-visible {
          outline: 3px solid rgba(37, 99, 235, 0.3);
          outline-offset: 2px;
        }
        .pencil-scratchpad button:disabled { cursor: default; opacity: 0.42; }
        .pencil-scratchpad button.is-active {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1d4ed8;
        }
        .pencil-scratchpad__collapse {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-color: transparent !important;
          background: transparent !important;
        }
        .pencil-scratchpad__body { padding: 12px 14px 14px; }
        .pencil-scratchpad__toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 9px;
          margin-bottom: 10px;
        }
        .pencil-scratchpad__mode-group,
        .pencil-scratchpad__tool-group,
        .pencil-scratchpad__colors,
        .pencil-scratchpad__history {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pencil-scratchpad__colors {
          padding: 3px;
          border: 1px solid #e2e7ed;
          border-radius: 999px;
          background: #f8fafc;
        }
        .pencil-scratchpad__colors button {
          width: 32px;
          min-height: 32px;
          padding: 5px;
          border: 0;
          border-radius: 50%;
          background: transparent;
        }
        .pencil-scratchpad__colors button.is-active {
          box-shadow: inset 0 0 0 2px #ffffff, 0 0 0 2px #2563eb;
        }
        .pencil-scratchpad__colors button span {
          display: block;
          width: 100%;
          height: 100%;
          border: 1px solid rgba(0, 0, 0, 0.14);
          border-radius: 50%;
        }
        .pencil-scratchpad__history .is-danger { color: #b42318; }
        .pencil-scratchpad__paper {
          position: relative;
          overflow: hidden;
          width: 100%;
          height: clamp(280px, 40vw, 520px);
          border: 1px solid #dbe3eb;
          border-radius: 13px;
          background: #eef2f6;
          box-shadow: inset 0 1px 4px rgba(31, 41, 55, 0.04);
        }
        .pencil-scratchpad__paper-canvas,
        .pencil-scratchpad__canvas {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
        }
        .pencil-scratchpad__paper-canvas {
          z-index: 1;
          pointer-events: none;
        }
        .pencil-scratchpad__canvas {
          z-index: 2;
          cursor: crosshair;
          touch-action: none;
          overscroll-behavior: contain;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
        .pencil-scratchpad.is-scroll-mode .pencil-scratchpad__canvas {
          cursor: grab;
          touch-action: pan-y pinch-zoom;
        }
        .pencil-scratchpad__loading {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgba(255, 254, 250, 0.78);
          color: #64748b;
          font-size: 0.88rem;
          z-index: 3;
          pointer-events: none;
        }
        .pencil-scratchpad__help,
        .pencil-scratchpad__error {
          margin: 9px 2px 0;
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .pencil-scratchpad__help { color: #6b7280; }
        .pencil-scratchpad__error { color: #b42318; }
        @media (min-width: 768px) {
          .pencil-scratchpad__body { padding: 14px 16px 16px; }
          .pencil-scratchpad__paper { height: clamp(380px, 45vw, 620px); }
          .pencil-scratchpad button { min-height: 44px; }
        }
        @media (min-width: 1180px) {
          .pencil-scratchpad__paper { height: clamp(430px, 38vw, 660px); }
        }
        @media (max-width: 620px) {
          .pencil-scratchpad { border-radius: 14px; }
          .pencil-scratchpad__header { padding-left: 14px; }
          .pencil-scratchpad__save-state { display: none; }
          .pencil-scratchpad__body { padding: 10px; }
          .pencil-scratchpad__toolbar { align-items: stretch; }
          .pencil-scratchpad__mode-group { width: 100%; }
          .pencil-scratchpad__history { margin-left: auto; }
          .pencil-scratchpad__tool-group button,
          .pencil-scratchpad__history button { padding-inline: 9px; }
          .pencil-scratchpad__paper { height: min(58vh, 430px); }
          .pencil-scratchpad__help { padding-inline: 2px; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .pencil-scratchpad button { transition: background-color 140ms ease, border-color 140ms ease; }
        }
      `}</style>
    </section>
  );
}
