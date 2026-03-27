"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const LINE_INTERVAL_MS = 800;
const AFTER_LAST_MS = 1000;

export interface AILoadingProps {
  onComplete: () => void;
  /** 干饭人数量，用于第 2 行 */
  memberCount?: number;
  /** 展示用预算文案，如「¥80 — ¥150」 */
  budgetRange?: string;
  /** 商圈 / 区域名 */
  geoArea?: string;
  /** 第 3 行天气片段；不传则用示例文案 */
  weatherLine?: string;
}

function buildLines(
  memberCount: number,
  budgetRange: string,
  geoArea: string,
  weatherLine: string,
): string[] {
  return [
    "> 正在收集所有人的偏好数据...",
    `> 发现 ${memberCount} 位干饭人的口味交集...`,
    weatherLine,
    `> 分析预算范围... 人均 ${budgetRange} 区间`,
    `> 计算地理中心点... 📍 交通最优区域：${geoArea}`,
    "> 有人不吃辣，降低重辣优先级...",
    "> 有人吃素，过滤纯肉类餐厅...",
    "> 正在匹配最佳餐厅...",
    "> ✅ 计算完成！找到 3 个完美选择",
  ];
}

export default function AILoading({
  onComplete,
  memberCount = 5,
  budgetRange = "¥80 — ¥150",
  geoArea = "核心汇合区",
  weatherLine = "> 正在获取天气信息... 🌤️ 明天 28°C，适合室内餐厅",
}: AILoadingProps) {
  const lines = useMemo(
    () => buildLines(memberCount, budgetRange, geoArea, weatherLine),
    [memberCount, budgetRange, geoArea, weatherLine],
  );

  const lineCount = lines.length;

  const [visibleCount, setVisibleCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 仅依赖行数：天气等文案异步更新时不重置打字机动画
  useEffect(() => {
    setVisibleCount(1);

    let current = 1;
    let finishTimerId: number | null = null;

    const iv = window.setInterval(() => {
      current += 1;
      setVisibleCount(current);
      if (current >= lineCount) {
        window.clearInterval(iv);
        finishTimerId = window.setTimeout(() => {
          onCompleteRef.current();
        }, AFTER_LAST_MS);
      }
    }, LINE_INTERVAL_MS);

    return () => {
      window.clearInterval(iv);
      if (finishTimerId !== null) window.clearTimeout(finishTimerId);
    };
  }, [lineCount]);

  const visibleLines = lines.slice(0, visibleCount);

  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl ring-1 ring-white/10">
        {/* macOS-style title bar */}
        <div className="flex h-9 items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 text-[11px] font-medium tracking-wide text-zinc-500">
            suibian-ju — ai-engine
          </span>
        </div>

        <div className="max-h-[min(52vh,420px)] min-h-[200px] overflow-y-auto bg-[#0d0d0d] px-3 py-3 font-mono text-[13px] leading-relaxed text-zinc-300">
          <AnimatePresence initial={false}>
            {visibleLines.map((line, i) => (
              <motion.div
                key={`${i}-${line.slice(0, 24)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="mb-1.5 flex gap-1.5 break-words"
              >
                <span className="shrink-0 font-bold text-emerald-500">&gt;</span>
                <span className="text-zinc-200">{line.replace(/^>\s*/, "")}</span>
              </motion.div>
            ))}
          </AnimatePresence>

          {visibleCount < lineCount && (
            <motion.span
              className="ml-4 inline-block h-4 w-2 bg-emerald-500/90"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.7 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
