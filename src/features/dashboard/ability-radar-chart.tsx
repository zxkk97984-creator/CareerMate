"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { useMotionSafe } from "@/lib/motion/motion-safe";
import { buildRadarGeometry, RADAR_CENTER, type RadarAbilityInput } from "@/lib/dashboard/radar";
import "./ability-radar-chart.css";

interface AbilityRadarChartProps {
  abilities: RadarAbilityInput[];
}

export function radarCaption(geometry: ReturnType<typeof buildRadarGeometry>): string {
  const missing = geometry.totalCount - geometry.evaluatedCount;
  if (geometry.evaluatedCount === 0) return "完成画像或任务后，能力维度会出现在雷达图上。";
  if (missing === 0) return `${geometry.totalCount} 项维度均有评估数据。`;
  return `虚线仅连接已评估维度；${missing} 项待评估不会按 0 分计入。`;
}

export function radarAriaLabel(geometry: ReturnType<typeof buildRadarGeometry>): string {
  const parts = geometry.axes.map((axis) => (axis.evaluated ? `${axis.shortLabel} ${axis.score} 分` : `${axis.shortLabel}待评估`));
  return `能力雷达图：${parts.join("、")}`;
}

/** 能力雷达图：SSR 直出最终图形，hydration 后在允许动效时播放一次缩放入场 */
export function AbilityRadarChart({ abilities }: AbilityRadarChartProps) {
  const geometry = buildRadarGeometry(abilities);
  const dataRef = useRef<SVGGElement>(null);
  const motionSafe = useMotionSafe();
  const hasData = geometry.evaluatedCount > 0;

  useLayoutEffect(() => {
    const el = dataRef.current;
    if (!el || !motionSafe || !hasData) return;
    const tween = gsap.from(el, {
      opacity: 0,
      scale: 0.88,
      svgOrigin: `${RADAR_CENTER.x} ${RADAR_CENTER.y}`,
      duration: 0.5,
      ease: "power2.out",
    });
    return () => {
      tween.kill();
      gsap.set(el, { clearProps: "opacity,transform,transformOrigin" });
    };
  }, [motionSafe, hasData]);

  return (
    <figure className="growth-radar">
      <svg
        className="growth-radar-svg"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={radarAriaLabel(geometry)}
        focusable="false"
      >
        <g aria-hidden="true">
          {geometry.rings.map((ring) => (
            <polygon
              key={ring.ratio}
              className={ring.ratio === 1 ? "growth-radar-ring growth-radar-ring-outer" : "growth-radar-ring"}
              points={ring.points}
            />
          ))}
          {geometry.spokes.map((spoke, index) => (
            <line key={index} className="growth-radar-spoke" x1={spoke.x1} y1={spoke.y1} x2={spoke.x2} y2={spoke.y2} />
          ))}
        </g>

        {hasData && (
          <g ref={dataRef} className="growth-radar-data" aria-hidden="true">
            {geometry.polygonPoints && <polygon className="growth-radar-polygon" points={geometry.polygonPoints} />}
            {geometry.polylinePoints && <polyline className="growth-radar-polyline" points={geometry.polylinePoints} strokeDasharray="5 4" />}
            {geometry.axes.map((axis) =>
              axis.evaluated ? <circle key={axis.key} className="growth-radar-dot" cx={axis.x!} cy={axis.y!} r={2.6} /> : null,
            )}
          </g>
        )}

        <g className="growth-radar-labels" aria-hidden="true">
          {geometry.axes.map((axis) => (
            <text
              key={axis.key}
              className="growth-radar-label"
              x={axis.labelX}
              y={axis.labelY}
              textAnchor={axis.anchor}
              dominantBaseline="middle"
            >
              <tspan x={axis.labelX}>{axis.shortLabel}</tspan>
              {!axis.evaluated && (
                <tspan x={axis.labelX} dy="12" className="growth-radar-label-missing">
                  待评估
                </tspan>
              )}
            </text>
          ))}
          {!hasData && (
            <text
              className="growth-radar-empty"
              x={geometry.centerX}
              y={geometry.centerY}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              还没有可展示的能力评估
            </text>
          )}
        </g>
      </svg>
      <figcaption className="growth-radar-caption">{radarCaption(geometry)}</figcaption>
    </figure>
  );
}
