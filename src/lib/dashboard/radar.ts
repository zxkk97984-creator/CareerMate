import { abilityKeys, abilityLabels, abilityShortLabels, type AbilityKey } from "@/lib/types";

/**
 * 能力雷达图几何：纯函数，SSR 与客户端结果一致。
 * 约定：缺失维度不生成任何顶点坐标，避免被读成 0 分。
 */

export const RADAR_VIEWBOX = { width: 320, height: 300 } as const;
export const RADAR_CENTER = { x: 160, y: 148 } as const;
/** 满分半径（分数 100 对应的顶点到圆心距离） */
export const RADAR_MAX_RADIUS = 96;
/** 轴标签所在圆的半径 */
const RADAR_LABEL_RADIUS = 122;
/** 格网环比例，由内向外 */
export const RADAR_RING_RATIOS = [0.25, 0.5, 0.75, 1] as const;

export interface RadarAbilityInput {
  key: string;
  label: string;
  score: number | null;
}

export type RadarLabelAnchor = "start" | "middle" | "end";

export interface RadarAxis {
  key: AbilityKey;
  /** 轴上的短标签（窄空间用） */
  shortLabel: string;
  /** 证据与列表使用的完整标签 */
  fullLabel: string;
  score: number | null;
  evaluated: boolean;
  angle: number;
  /** 顶点坐标；维度未评估时为 null，不产生任何落点 */
  x: number | null;
  y: number | null;
  labelX: number;
  labelY: number;
  anchor: RadarLabelAnchor;
}

export interface RadarGeometry {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  maxRadius: number;
  rings: Array<{ ratio: number; points: string }>;
  spokes: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  axes: RadarAxis[];
  /** 仅当全部维度均已评估时非空 */
  polygonPoints: string | null;
  /** 仅当部分维度已评估时非空：按轴序连接已评估顶点 */
  polylinePoints: string | null;
  evaluatedCount: number;
  totalCount: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 把分数收敛到 0-100；null/NaN/Infinity 表示未评估 */
export function normalizeRadarScore(score: number | null | undefined): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, score));
}

function polarPoint(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: RADAR_CENTER.x + radius * Math.cos(rad), y: RADAR_CENTER.y + radius * Math.sin(rad) };
}

/** 第 i 轴角度：第一维指向正上方，顺时针每 60° 一维 */
export function radarAxisAngle(index: number, total: number): number {
  return -90 + (360 / total) * index;
}

function labelAnchor(angle: number): RadarLabelAnchor {
  const cos = Math.cos((angle * Math.PI) / 180);
  if (cos > 0.01) return "start";
  if (cos < -0.01) return "end";
  return "middle";
}

function serialize(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

export function buildRadarGeometry(abilities: RadarAbilityInput[]): RadarGeometry {
  const byKey = new Map(abilities.map((ability) => [ability.key, ability]));
  const total = abilityKeys.length;
  const axes: RadarAxis[] = abilityKeys.map((key, index) => {
    const angle = radarAxisAngle(index, total);
    const score = normalizeRadarScore(byKey.get(key)?.score ?? null);
    const evaluated = score !== null;
    const vertex = evaluated ? polarPoint(angle, (RADAR_MAX_RADIUS * score!) / 100) : null;
    const labelPoint = polarPoint(angle, RADAR_LABEL_RADIUS);
    return {
      key,
      shortLabel: abilityShortLabels[key],
      fullLabel: byKey.get(key)?.label ?? abilityLabels[key],
      score,
      evaluated,
      angle,
      x: vertex ? round(vertex.x) : null,
      y: vertex ? round(vertex.y) : null,
      labelX: round(labelPoint.x),
      labelY: round(labelPoint.y),
      anchor: labelAnchor(angle),
    };
  });

  const evaluatedAxes = axes.filter((axis) => axis.evaluated && axis.x !== null && axis.y !== null);
  const evaluatedCount = evaluatedAxes.length;
  const outerRing = abilityKeys.map((_, index) => polarPoint(radarAxisAngle(index, total), RADAR_MAX_RADIUS));

  return {
    width: RADAR_VIEWBOX.width,
    height: RADAR_VIEWBOX.height,
    centerX: RADAR_CENTER.x,
    centerY: RADAR_CENTER.y,
    maxRadius: RADAR_MAX_RADIUS,
    rings: RADAR_RING_RATIOS.map((ratio) => ({
      ratio,
      points: serialize(abilityKeys.map((_, index) => polarPoint(radarAxisAngle(index, total), RADAR_MAX_RADIUS * ratio))),
    })),
    spokes: outerRing.map((point) => ({
      x1: RADAR_CENTER.x,
      y1: RADAR_CENTER.y,
      x2: round(point.x),
      y2: round(point.y),
    })),
    axes,
    polygonPoints: evaluatedCount === total ? serialize(axes.map((axis) => ({ x: axis.x!, y: axis.y! }))) : null,
    polylinePoints: evaluatedCount > 0 && evaluatedCount < total ? serialize(evaluatedAxes.map((axis) => ({ x: axis.x!, y: axis.y! }))) : null,
    evaluatedCount,
    totalCount: total,
  };
}
