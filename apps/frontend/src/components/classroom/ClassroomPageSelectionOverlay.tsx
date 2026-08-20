import type { PointerEvent as ReactPointerEvent } from "react";
import { RotateCw } from "lucide-react";
import type { CsStroke } from "../../api/classroom";
import {
  REF_WIDTH,
  type ShapeStyle,
} from "./classroomCanvasText";
import { connectorCurvePoint } from "./classroomShapeBindings";
import { TextStylePanel } from "./ClassroomTextStylePanel";
import { ShapeStylePanel } from "./ClassroomShapeStylePanel";
import { AutoFlipPositioner } from "./AutoFlipPositioner";
import type { DrawTool } from "./ClassroomPdfPage";

interface ClassroomPageSelectionOverlayProps {
  tool: DrawTool;
  selectedText: CsStroke | null;
  editingTextId: string | null;
  selectedShape: CsStroke | null;
  selectedShapeRaw: CsStroke | null;
  shapeStyle: ShapeStyle;
  color: string;
  strokeWidth: number;
  showStylePanel: boolean;
  isTransforming?: boolean;
  size: { w: number; h: number };
  pageNumber: number;
  onToolChange?: (tool: DrawTool) => void;
  onColorChange?: (color: string) => void;
  onStrokeWidthChange?: (width: number) => void;
  onShapeStyleChange?: (style: ShapeStyle) => void;
  applyColorToSelection: (color: string) => void;
  updateSelectedText: (patch: Partial<CsStroke>) => void;
  updateSelectedShape: (patch: Partial<CsStroke>) => void;
  deleteStrokeAndAttachedConnectors: (strokeId: string | string[]) => void;
  setSelectedTextId: (id: string | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  setConnectorTarget: (target: any) => void;
  setTextEditor: React.Dispatch<React.SetStateAction<any>>;
  onReorderStroke?: (
    page: number,
    strokeIds: string[],
    op: "front" | "back" | "forward" | "backward",
  ) => void;
  beginTextResize: (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => void;
  beginTextRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  transformText: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finishTextTransform: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  beginShapeResize: (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => void;
  beginShapeRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  transformShape: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finishShapeTransform: (event: ReactPointerEvent<HTMLElement>) => void;
  beginLineEndpointResize: (
    event: ReactPointerEvent<HTMLDivElement>,
    endpoint: "start" | "end" | "mid",
  ) => void;
  transformLineEndpoint: (event: ReactPointerEvent<HTMLDivElement>) => void;
  beginConnectorFromStroke: (
    event: ReactPointerEvent<HTMLButtonElement>,
    stroke: CsStroke,
    side: "top" | "right" | "bottom" | "left",
  ) => void;
  moveConnectorFromShape: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finishConnectorFromShape: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  connectorDraftRef: React.RefObject<any>;
  setConnectorHover: React.Dispatch<React.SetStateAction<any>>;
}

export function ClassroomPageSelectionOverlay({
  tool,
  selectedText,
  editingTextId,
  selectedShape,
  selectedShapeRaw,
  shapeStyle,
  color,
  strokeWidth,
  showStylePanel,
  isTransforming,
  size,
  pageNumber,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onShapeStyleChange,
  applyColorToSelection,
  updateSelectedText,
  updateSelectedShape,
  deleteStrokeAndAttachedConnectors,
  setSelectedTextId,
  setSelectedShapeId,
  setConnectorTarget,
  setTextEditor,
  onReorderStroke,
  beginTextResize,
  beginTextRotate,
  transformText,
  finishTextTransform,
  beginShapeResize,
  beginShapeRotate,
  transformShape,
  finishShapeTransform,
  beginLineEndpointResize,
  transformLineEndpoint,
  beginConnectorFromStroke,
  moveConnectorFromShape,
  finishConnectorFromShape,
  connectorDraftRef,
  setConnectorHover,
}: ClassroomPageSelectionOverlayProps) {
  return (
    <>
      {tool === "select" &&
        selectedText &&
        selectedText.id !== editingTextId && (
          <>
            <div
              className="pointer-events-none absolute z-20 border border-indigo-500"
              style={{
                left: `${selectedText.points[0] * 100}%`,
                top: `${selectedText.points[1] * 100}%`,
                width: `${(selectedText.textBoxWidth ?? 320) * (size.w / REF_WIDTH)}px`,
                height: `${(selectedText.textBoxHeight ?? 120) * (size.w / REF_WIDTH)}px`,
                transform: `rotate(${selectedText.rotation ?? 0}deg)`,
                transformOrigin: "center",
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Matn o'lchamini ${corner} tomondan o'zgartirish`}
                  className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-blue-600 bg-white dark:bg-white shadow-xs hover:scale-125 transition-transform duration-150 cursor-pointer"
                  style={{
                    left: corner.includes("w") ? "0%" : "100%",
                    top: corner.includes("n") ? "0%" : "100%",
                    cursor:
                      corner === "nw" || corner === "se"
                        ? "nwse-resize"
                        : "nesw-resize",
                  }}
                  onPointerDown={(event) => beginTextResize(event, corner)}
                  onPointerMove={transformText}
                  onPointerUp={finishTextTransform}
                  onPointerCancel={finishTextTransform}
                />
              ))}
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <button
                  key={`text-connector-${side}`}
                  type="button"
                  aria-label={`Text box ${side} qirrasidan connector chizish`}
                  className="pointer-events-auto absolute z-50 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-white border border-blue-600 shadow-xs hover:scale-150 hover:bg-blue-100 hover:ring-4 hover:ring-blue-400/30 active:scale-125 transition-all duration-150 cursor-crosshair"
                  style={{
                    left:
                      side === "left"
                        ? "-20px"
                        : side === "right"
                          ? "calc(100% + 20px)"
                          : "50%",
                    top:
                      side === "top"
                        ? "-20px"
                        : side === "bottom"
                          ? "calc(100% + 20px)"
                          : "50%",
                  }}
                  onPointerDown={(event) =>
                    beginConnectorFromStroke(event, selectedText, side)
                  }
                  onPointerMove={moveConnectorFromShape}
                  onPointerUp={finishConnectorFromShape}
                  onPointerCancel={finishConnectorFromShape}
                  onPointerEnter={() => {
                    if (!connectorDraftRef.current) {
                      setConnectorHover({ stroke: selectedText, side });
                    }
                  }}
                  onPointerLeave={() => {
                    if (!connectorDraftRef.current) {
                      setConnectorHover(null);
                    }
                  }}
                />
              ))}
              <button
                type="button"
                aria-label="Matnni aylantirish"
                className="pointer-events-auto absolute z-50 flex h-6 w-6 items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-600 bg-white dark:bg-white text-blue-600 shadow-xs cursor-grab active:cursor-grabbing hover:scale-125 hover:bg-blue-50 transition-all duration-150"
                style={{
                  left: "calc(100% + 22px)",
                  top: "-22px",
                }}
                onPointerDown={beginTextRotate}
                onPointerMove={transformText}
                onPointerUp={finishTextTransform}
                onPointerCancel={finishTextTransform}
              >
                <RotateCw size={12} className="stroke-2" />
              </button>
            </div>
            {showStylePanel && !isTransforming && (() => {
              const w =
                (selectedText.textBoxWidth ?? 320) * (size.w / REF_WIDTH);
              const h =
                (selectedText.textBoxHeight ?? 120) * (size.w / REF_WIDTH);
              const originX = selectedText.points[0] * size.w;
              const originY = selectedText.points[1] * size.h;
              const cx = originX + w / 2;
              const cy = originY + h / 2;
              const rad = ((selectedText.rotation ?? 0) * Math.PI) / 180;
              const halfRotH =
                (w / 2) * Math.abs(Math.sin(rad)) +
                (h / 2) * Math.abs(Math.cos(rad));
              const topY = cy - halfRotH;
              const bottomY = cy + halfRotH;
              return (
                <AutoFlipPositioner
                  anchorLeft={`${cx}px`}
                  anchorTopPx={topY}
                  anchorBottomPx={bottomY}
                >
                  {(openBelow) => (
                <TextStylePanel
                  dropdownDirection={openBelow ? "up" : "down"}
                  color={selectedText.color}
                  fontFamily={selectedText.fontFamily ?? "Inter"}
                  fontSize={selectedText.fontSize ?? 24}
                  fontWeight={selectedText.fontWeight ?? 600}
                  textAlign={selectedText.textAlign ?? "left"}
                  rotation={0}
                  onColorChange={(nextColor) =>
                    updateSelectedText({ color: nextColor })
                  }
                  onFontFamilyChange={(fontFamily) =>
                    updateSelectedText({ fontFamily })
                  }
                  onFontSizeChange={(fontSize) =>
                    updateSelectedText({ fontSize })
                  }
                  onFontWeightChange={(fontWeight) =>
                    updateSelectedText({ fontWeight })
                  }
                  onTextAlignChange={(textAlign) =>
                    updateSelectedText({ textAlign })
                  }
                  onReorder={(op) =>
                    selectedText &&
                    onReorderStroke?.(pageNumber, [selectedText.id], op)
                  }
                  onDelete={() => {
                    deleteStrokeAndAttachedConnectors(selectedText.id);
                    setSelectedTextId(null);
                  }}
                />
                  )}
                </AutoFlipPositioner>
              );
            })()}
          </>
        )}

      {showStylePanel &&
        (tool === "rectangle" ||
          tool === "ellipse" ||
          tool === "line" ||
          tool === "arrow") &&
        !selectedShape &&
        onShapeStyleChange && (
          <ShapeStylePanel
            color={color}
            backgroundColor={shapeStyle.backgroundColor}
            fillStyle={shapeStyle.fillStyle}
            strokeWidth={strokeWidth}
            strokeStyle={shapeStyle.strokeStyle}
            lineShape={shapeStyle.lineShape ?? "straight"}
            startArrowHead={shapeStyle.startArrowHead ?? "none"}
            endArrowHead={
              shapeStyle.endArrowHead ?? (tool === "line" ? "none" : "arrow")
            }
            edges={shapeStyle.edges}
            opacity={shapeStyle.opacity}
            strokeTool={tool}
            style={{
              left: "50%",
              top: "16px",
              transform: "translateX(-50%)",
            }}
            onToolChange={onToolChange}
            onColorChange={(nextColor, nextStrokeStyle) => {
              onColorChange?.(nextColor);
              if (
                nextStrokeStyle &&
                nextStrokeStyle !== shapeStyle.strokeStyle
              ) {
                onShapeStyleChange({
                  ...shapeStyle,
                  strokeStyle: nextStrokeStyle,
                });
              }
              applyColorToSelection(nextColor);
            }}
            onBackgroundColorChange={(backgroundColor) =>
              onShapeStyleChange({
                ...shapeStyle,
                backgroundColor,
                fillStyle:
                  backgroundColor === "transparent"
                    ? (shapeStyle.fillStyle ?? "solid")
                    : "solid",
              })
            }
            onFillStyleChange={(fillStyle) =>
              onShapeStyleChange({ ...shapeStyle, fillStyle })
            }
            onStrokeWidthChange={(width) => onStrokeWidthChange?.(width)}
            onStrokeStyleChange={(strokeStyle) => {
              onShapeStyleChange({
                ...shapeStyle,
                strokeStyle,
              });
              if (strokeStyle !== "none" && strokeWidth === 0) {
                onStrokeWidthChange?.(2);
              }
            }}
            onLineShapeChange={(lineShape) =>
              onShapeStyleChange({ ...shapeStyle, lineShape })
            }
            onArrowHeadChange={(endArrowHead, startArrowHead) => {
              const isNone =
                endArrowHead === "none" && startArrowHead === "none";
              onShapeStyleChange({
                ...shapeStyle,
                endArrowHead,
                startArrowHead,
              });
              if (isNone) {
                onToolChange?.("line");
              } else {
                onToolChange?.("arrow");
              }
            }}
            onEdgesChange={(edges) =>
              onShapeStyleChange({ ...shapeStyle, edges })
            }
            onOpacityChange={(opacity) =>
              onShapeStyleChange({ ...shapeStyle, opacity })
            }
            onSwapDirection={() => {
              const curEnd =
                shapeStyle.endArrowHead ??
                (tool === "line" ? "none" : "arrow");
              const curStart = shapeStyle.startArrowHead ?? "none";
              onShapeStyleChange({
                ...shapeStyle,
                endArrowHead: curStart,
                startArrowHead: curEnd,
              });
            }}
            onReorder={() => {}}
          />
        )}

      {tool === "select" && selectedShape && (
        <>
          {selectedShape.tool === "line" || selectedShape.tool === "arrow" ? (
            <>
              <div
                className="pointer-events-auto absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-indigo-500 bg-white cursor-move shadow-md"
                style={{
                  left: `${selectedShape.points[0] * 100}%`,
                  top: `${selectedShape.points[1] * 100}%`,
                }}
                onPointerDown={(e) => beginLineEndpointResize(e, "start")}
                onPointerMove={transformLineEndpoint}
                onPointerUp={finishShapeTransform}
                onPointerCancel={finishShapeTransform}
              />
              <div
                className="pointer-events-auto absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-indigo-500 bg-white cursor-move shadow-md"
                style={{
                  left: `${selectedShape.points[2] * 100}%`,
                  top: `${selectedShape.points[3] * 100}%`,
                }}
                onPointerDown={(e) => beginLineEndpointResize(e, "end")}
                onPointerMove={transformLineEndpoint}
                onPointerUp={finishShapeTransform}
                onPointerCancel={finishShapeTransform}
              />
              {(selectedShape.lineShape === "curved" ||
                selectedShape.lineShape === "elbow") &&
                (() => {
                  const x0 = selectedShape.points[0];
                  const y0 = selectedShape.points[1];
                  const x1 = selectedShape.points[2];
                  const y1 = selectedShape.points[3];
                  const ctrlX = selectedShape.controlX ?? (x0 + x1) / 2;
                  let dotX = (x0 + x1) / 2;
                  let dotY = (y0 + y1) / 2;
                  if (selectedShape.lineShape === "curved") {
                    [dotX, dotY] = connectorCurvePoint(
                      selectedShape,
                      0.5,
                      size.w,
                      size.h,
                    );
                  } else if (selectedShape.lineShape === "elbow") {
                    dotX = ctrlX;
                    dotY = (y0 + y1) / 2;
                  }
                  dotX = Math.max(0.01, Math.min(0.99, dotX));
                  dotY = Math.max(0.01, Math.min(0.99, dotY));
                  return (
                    <div
                      className="pointer-events-auto absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-indigo-500 bg-white dark:bg-white cursor-grab shadow-md"
                      style={{
                        left: `${dotX * 100}%`,
                        top: `${dotY * 100}%`,
                      }}
                      onPointerDown={(e) => beginLineEndpointResize(e, "mid")}
                      onPointerMove={transformLineEndpoint}
                      onPointerUp={finishShapeTransform}
                      onPointerCancel={finishShapeTransform}
                    />
                  );
                })()}
            </>
          ) : (
            <div
              className="pointer-events-none absolute z-20 border border-indigo-500"
              style={{
                left: `${Math.min(selectedShape.points[0], selectedShape.points[2]) * 100}%`,
                top: `${Math.min(selectedShape.points[1], selectedShape.points[3]) * 100}%`,
                width: `${Math.abs(selectedShape.points[2] - selectedShape.points[0]) * 100}%`,
                height: `${Math.abs(selectedShape.points[3] - selectedShape.points[1]) * 100}%`,
                transform: `rotate(${selectedShape.rotation ?? 0}deg)`,
                transformOrigin: "center",
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Shape o'lchamini ${corner} tomondan o'zgartirish`}
                  className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-blue-600 bg-white dark:bg-white shadow-xs hover:scale-125 transition-transform duration-150 cursor-pointer"
                  style={{
                    left: corner.includes("w") ? "0%" : "100%",
                    top: corner.includes("n") ? "0%" : "100%",
                    cursor:
                      corner === "nw" || corner === "se"
                        ? "nwse-resize"
                        : "nesw-resize",
                  }}
                  onPointerDown={(event) => beginShapeResize(event, corner)}
                  onPointerMove={transformShape}
                  onPointerUp={finishShapeTransform}
                  onPointerCancel={finishShapeTransform}
                />
              ))}
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <button
                  key={`connector-${side}`}
                  type="button"
                  aria-label={`${side} qirradan connector chizish`}
                  className="pointer-events-auto absolute z-50 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-white border border-blue-600 shadow-xs hover:scale-150 hover:bg-blue-100 hover:ring-4 hover:ring-blue-400/30 active:scale-125 transition-all duration-150 cursor-crosshair"
                  style={{
                    left:
                      side === "left"
                        ? "-20px"
                        : side === "right"
                          ? "calc(100% + 20px)"
                          : "50%",
                    top:
                      side === "top"
                        ? "-20px"
                        : side === "bottom"
                          ? "calc(100% + 20px)"
                          : "50%",
                  }}
                  onPointerDown={(event) =>
                    beginConnectorFromStroke(event, selectedShapeRaw!, side)
                  }
                  onPointerMove={moveConnectorFromShape}
                  onPointerUp={finishConnectorFromShape}
                  onPointerCancel={finishConnectorFromShape}
                  onPointerEnter={() => {
                    if (!connectorDraftRef.current && selectedShapeRaw) {
                      setConnectorHover({ stroke: selectedShapeRaw, side });
                    }
                  }}
                  onPointerLeave={() => {
                    if (!connectorDraftRef.current) {
                      setConnectorHover(null);
                    }
                  }}
                />
              ))}
              <button
                type="button"
                aria-label="Shape'ni aylantirish"
                className="pointer-events-auto absolute z-50 flex h-6 w-6 items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-600 bg-white dark:bg-white text-blue-600 shadow-xs cursor-grab active:cursor-grabbing hover:scale-125 hover:bg-blue-50 transition-all duration-150"
                style={{
                  left: "calc(100% + 22px)",
                  top: "-22px",
                }}
                onPointerDown={beginShapeRotate}
                onPointerMove={transformShape}
                onPointerUp={finishShapeTransform}
                onPointerCancel={finishShapeTransform}
              >
                <RotateCw size={12} className="stroke-2" />
              </button>
            </div>
          )}
          {showStylePanel &&
            !isTransforming &&
            (() => {
              const w =
                Math.abs(selectedShape.points[2] - selectedShape.points[0]) *
                size.w;
              const h =
                Math.abs(selectedShape.points[3] - selectedShape.points[1]) *
                size.h;
              const originX =
                Math.min(selectedShape.points[0], selectedShape.points[2]) *
                size.w;
              const originY =
                Math.min(selectedShape.points[1], selectedShape.points[3]) *
                size.h;
              const cx = originX + w / 2;
              const cy = originY + h / 2;
              const rad = ((selectedShape.rotation ?? 0) * Math.PI) / 180;
              const halfRotH =
                (w / 2) * Math.abs(Math.sin(rad)) +
                (h / 2) * Math.abs(Math.cos(rad));
              const topY = cy - halfRotH;
              const bottomY = cy + halfRotH;
              return (
                <AutoFlipPositioner
                  anchorLeft={`${cx}px`}
                  anchorTopPx={topY}
                  anchorBottomPx={bottomY}
                >
                  {(openBelow) => (
                <ShapeStylePanel
                  dropdownDirection={openBelow ? "up" : "down"}
                  color={selectedShape.color}
                  textColor={selectedShape.textColor || selectedShape.color}
                  backgroundColor={
                    selectedShape.backgroundColor ?? "transparent"
                  }
                  fillStyle={selectedShape.fillStyle ?? "hachure"}
                  strokeWidth={selectedShape.width}
                  strokeStyle={selectedShape.strokeStyle ?? "solid"}
                  lineShape={selectedShape.lineShape ?? "straight"}
                  startArrowHead={selectedShape.startArrowHead ?? "none"}
                  endArrowHead={
                    selectedShape.endArrowHead ??
                    (selectedShape.tool === "line" ? "none" : "arrow")
                  }
                  edges={selectedShape.edges ?? "round"}
                  opacity={selectedShape.opacity ?? 100}
                  rotation={0}
                  strokeTool={selectedShape.tool}
                  text={selectedShape.text}
                  fontFamily={selectedShape.fontFamily ?? "Inter"}
                  fontSize={selectedShape.fontSize ?? 24}
                  fontWeight={selectedShape.fontWeight ?? 600}
                  textAlign={selectedShape.textAlign ?? "center"}
                  onFontFamilyChange={(fontFamily) => {
                    updateSelectedShape({ fontFamily });
                    setTextEditor((c: any) => (c ? { ...c, fontFamily } : c));
                  }}
                  onFontSizeChange={(fontSize) => {
                    updateSelectedShape({ fontSize });
                    setTextEditor((c: any) => (c ? { ...c, fontSize } : c));
                  }}
                  onFontWeightChange={(fontWeight) => {
                    updateSelectedShape({ fontWeight });
                    setTextEditor((c: any) => (c ? { ...c, fontWeight } : c));
                  }}
                  onTextAlignChange={(textAlign) => {
                    updateSelectedShape({ textAlign });
                    setTextEditor((c: any) => (c ? { ...c, textAlign } : c));
                  }}
                  onVerticalAlignChange={(verticalAlign) => {
                    updateSelectedShape({ verticalAlign });
                    setTextEditor((c: any) =>
                      c ? { ...c, verticalAlign } : c,
                    );
                  }}
                  onTextColorChange={(textColor) => {
                    updateSelectedShape({ textColor });
                    setTextEditor((c: any) => (c ? { ...c, color: textColor } : c));
                  }}
                  onToolChange={(nextTool) =>
                    updateSelectedShape({ tool: nextTool })
                  }
                  onColorChange={(nextColor, nextStrokeStyle) => {
                    if (
                      nextStrokeStyle &&
                      nextStrokeStyle !== selectedShape.strokeStyle
                    ) {
                      updateSelectedShape({
                        color: nextColor,
                        strokeStyle: nextStrokeStyle,
                        width:
                          selectedShape.width > 0 ? selectedShape.width : 2,
                      });
                    } else {
                      updateSelectedShape({ color: nextColor });
                    }
                  }}
                  onBackgroundColorChange={(backgroundColor) =>
                    updateSelectedShape({
                      backgroundColor,
                      fillStyle:
                        backgroundColor === "transparent"
                          ? (selectedShape.fillStyle ?? "solid")
                          : "solid",
                    })
                  }
                  onFillStyleChange={(fillStyle) =>
                    updateSelectedShape({ fillStyle })
                  }
                  onStrokeWidthChange={(width) =>
                    updateSelectedShape({ width })
                  }
                  onStrokeStyleChange={(strokeStyle) => {
                    if (
                      strokeStyle !== "none" &&
                      selectedShape.strokeStyle === "none"
                    ) {
                      updateSelectedShape({
                        strokeStyle,
                        width:
                          selectedShape.width > 0 ? selectedShape.width : 2,
                        color: selectedShape.color || "#000000",
                      });
                    } else {
                      updateSelectedShape({ strokeStyle });
                    }
                  }}
                  onLineShapeChange={(lineShape) =>
                    updateSelectedShape({ lineShape })
                  }
                  onArrowHeadChange={(endArrowHead, startArrowHead) => {
                    const isNone =
                      endArrowHead === "none" && startArrowHead === "none";
                    updateSelectedShape({
                      endArrowHead,
                      startArrowHead,
                      tool: isNone ? "line" : "arrow",
                    });
                  }}
                  onEdgesChange={(edges) => updateSelectedShape({ edges })}
                  onOpacityChange={(opacity) =>
                    updateSelectedShape({ opacity })
                  }
                  onSwapDirection={() => {
                    if (!selectedShape) return;
                    const revPoints = [
                      selectedShape.points[2],
                      selectedShape.points[3],
                      selectedShape.points[0],
                      selectedShape.points[1],
                    ];
                    const curEnd =
                      selectedShape.endArrowHead ??
                      (selectedShape.tool === "line" ? "none" : "arrow");
                    const curStart = selectedShape.startArrowHead ?? "none";
                    updateSelectedShape({
                      points: revPoints,
                      startBinding: selectedShape.endBinding,
                      endBinding: selectedShape.startBinding,
                      startArrowHead: curEnd,
                      endArrowHead: curStart,
                    });
                  }}
                  onDelete={() => {
                    if (selectedShape) {
                      deleteStrokeAndAttachedConnectors(selectedShape.id);
                      setSelectedShapeId(null);
                      setConnectorTarget(null);
                    }
                  }}
                  onReorder={(op) =>
                    selectedShape &&
                    onReorderStroke?.(pageNumber, [selectedShape.id], op)
                  }
                />
                  )}
                </AutoFlipPositioner>
              );
            })()}
        </>
      )}
    </>
  );
}
