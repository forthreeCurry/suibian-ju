"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";

const BUDGET_MIN = 0;
const BUDGET_MAX = 500;
const BUDGET_STEP = 10;

const PRESETS = [
  { label: "学生局", min: 0, max: 50 },
  { label: "普通局", min: 50, max: 120 },
  { label: "改善局", min: 100, max: 200 },
  { label: "不差钱", min: 200, max: 500 },
] as const;

const ALLERGY_TAGS = [
  "海鲜过敏",
  "花生坚果",
  "乳糖不耐",
  "麸质过敏",
] as const;

const PREFERENCE_TAGS = [
  "不吃香菜",
  "不吃葱蒜",
  "不吃内脏",
  "不吃辣",
  "吃素",
  "清真",
] as const;

interface PrivacyFormProps {
  onComplete?: (data: { budget: string; restrictions: string[] }) => void;
  onSubmit?: (budget: string, restrictions: string[]) => void;
  /** 流程内联用时跳过全屏成功页，仅触发 onSubmit */
  skipSuccessScreen?: boolean;
  submitLabel?: string;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function DualRangeSlider({
  min,
  max,
  step,
  valueLow,
  valueHigh,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  valueLow: number;
  valueHigh: number;
  onChange: (low: number, high: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pctLow = ((valueLow - min) / (max - min)) * 100;
  const pctHigh = ((valueHigh - min) / (max - min)) * 100;

  const resolve = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current!.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const raw = min + ratio * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step],
  );

  const startDrag = useCallback(
    (thumb: "low" | "high") => (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const v = resolve(ev.clientX);
        if (thumb === "low") {
          onChange(Math.min(v, valueHigh - step), valueHigh);
        } else {
          onChange(valueLow, Math.max(v, valueLow + step));
        }
      };

      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [resolve, onChange, valueLow, valueHigh, step],
  );

  return (
    <div className="relative h-10 w-full touch-none" ref={trackRef}>
      {/* track background */}
      <div className="absolute top-1/2 left-0 h-2 w-full -translate-y-1/2 rounded-full bg-white/30" />
      {/* active range */}
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-orange-400"
        style={{ left: `${pctLow}%`, width: `${pctHigh - pctLow}%` }}
      />
      {/* low thumb */}
      <div
        className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-orange-500 bg-white shadow-md active:cursor-grabbing active:scale-110"
        style={{ left: `${pctLow}%` }}
        onPointerDown={startDrag("low")}
      />
      {/* high thumb */}
      <div
        className="absolute top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-orange-500 bg-white shadow-md active:cursor-grabbing active:scale-110"
        style={{ left: `${pctHigh}%` }}
        onPointerDown={startDrag("high")}
      />
    </div>
  );
}

export default function PrivacyForm({
  onComplete,
  onSubmit,
  skipSuccessScreen = false,
  submitLabel = "🔒 匿名提交我的底线",
}: PrivacyFormProps) {
  const [budgetLow, setBudgetLow] = useState(50);
  const [budgetHigh, setBudgetHigh] = useState(150);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const handleRangeChange = useCallback((low: number, high: number) => {
    setBudgetLow(clamp(low, BUDGET_MIN, BUDGET_MAX));
    setBudgetHigh(clamp(high, BUDGET_MIN, BUDGET_MAX));
  }, []);

  const toggle = useCallback((t: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const restrictions = [...selected];
    const budgetStr = `${budgetLow}-${budgetHigh}`;

    onSubmit?.(budgetStr, restrictions);
    if (skipSuccessScreen) {
      onComplete?.({ budget: budgetStr, restrictions });
      return;
    }
    setSubmitted(true);
    setTimeout(() => onComplete?.({ budget: budgetStr, restrictions }), 800);
  }, [
    budgetLow,
    budgetHigh,
    selected,
    onSubmit,
    onComplete,
    skipSuccessScreen,
  ]);

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="text-5xl">✅</span>
        <h2 className="text-xl font-bold text-white drop-shadow">
          已匿名提交，没人知道你的底线
        </h2>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/20 bg-white/20 p-6 shadow-xl backdrop-blur-xl">
      {/* budget range slider */}
      <section>
        <h3 className="mb-1 text-base font-bold text-white drop-shadow">
          💰 人均预算
        </h3>
        <p className="mb-3 text-center text-2xl font-extrabold text-white drop-shadow-lg">
          ¥{budgetLow} — ¥{budgetHigh}
        </p>

        <DualRangeSlider
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          valueLow={budgetLow}
          valueHigh={budgetHigh}
          onChange={handleRangeChange}
        />
        <div className="mt-1 flex justify-between text-xs font-medium text-white/60">
          <span>¥0</span>
          <span>¥500</span>
        </div>

        {/* preset capsules */}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = budgetLow === p.min && budgetHigh === p.max;
            return (
              <motion.button
                key={p.label}
                whileTap={{ scale: 0.93 }}
                onClick={() => { setBudgetLow(p.min); setBudgetHigh(p.max); }}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-orange-500 text-white shadow-md"
                    : "bg-white/60 text-gray-700 hover:bg-white/80"
                }`}
              >
                {p.label}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* allergy restrictions */}
      <section className="mt-6">
        <h3 className="mb-3 text-base font-bold text-white drop-shadow">
          ⚠️ 过敏类
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {ALLERGY_TAGS.map((t) => {
            const active = selected.has(t);
            return (
              <motion.button
                key={t}
                whileTap={{ scale: 0.93 }}
                onClick={() => toggle(t)}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-2 border-red-400 bg-red-50 text-red-600"
                    : "border border-white/40 bg-white/50 text-gray-600 hover:bg-white/70"
                }`}
              >
                {t}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* preference restrictions */}
      <section className="mt-5">
        <h3 className="mb-3 text-base font-bold text-white drop-shadow">
          🚫 饮食偏好
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {PREFERENCE_TAGS.map((t) => {
            const active = selected.has(t);
            return (
              <motion.button
                key={t}
                whileTap={{ scale: 0.93 }}
                onClick={() => toggle(t)}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-2 border-orange-400 bg-orange-50 text-orange-600"
                    : "border border-white/40 bg-white/50 text-gray-600 hover:bg-white/70"
                }`}
              >
                {t}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* submit */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleSubmit}
        className="mt-8 w-full cursor-pointer rounded-full bg-orange-500 py-4 text-base font-bold text-white shadow-lg transition-opacity"
      >
        {submitLabel}
      </motion.button>
    </div>
  );
}
