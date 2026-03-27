"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { MVP_DEPARTURE_LOCATION } from "@/src/lib/mvpLocation";

const ManualLocationMap = dynamic(
  () => import("./ManualLocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-500">
        地图加载中…
      </div>
    ),
  },
);

interface LocationData {
  lat?: number;
  lon?: number;
  address: string;
}

interface LocationStepProps {
  onComplete: (data: { location: LocationData; transportMode: string }) => void;
}

const TRANSPORTS = [
  { id: "subway", emoji: "🚇", label: "地铁" },
  { id: "car", emoji: "🚗", label: "开车" },
  { id: "bike", emoji: "🚲", label: "骑行" },
  { id: "walk", emoji: "🚶", label: "步行" },
] as const;

export default function LocationStep({ onComplete }: LocationStepProps) {
  const [location, setLocation] = useState<LocationData | null>({
    lat: MVP_DEPARTURE_LOCATION.lat,
    lon: MVP_DEPARTURE_LOCATION.lon,
    address: MVP_DEPARTURE_LOCATION.address,
  });
  const [transport, setTransport] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const handleMapConfirm = useCallback((lat: number, lon: number, address: string) => {
    setLocation({ lat, lon, address });
    setManualMode(false);
  }, []);

  const handleMapBack = useCallback(() => {
    setManualMode(false);
  }, []);

  const canProceed = !!location && !!transport;

  const handleNext = useCallback(() => {
    if (!location || !transport) return;
    onComplete({ location, transportMode: transport });
  }, [location, transport, onComplete]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white drop-shadow-lg">
          你从哪出发？
        </h2>
        <p className="mt-1 text-sm text-white/60">
          MVP 阶段出发地固定为望京 SOHO，可地图微调
        </p>
      </div>

      <div className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
        {location && !manualMode && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-xl">📍</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">已选出发地</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-500 break-words">
                {location.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocation({
                  lat: MVP_DEPARTURE_LOCATION.lat,
                  lon: MVP_DEPARTURE_LOCATION.lon,
                  address: MVP_DEPARTURE_LOCATION.address,
                });
              }}
              className="shrink-0 cursor-pointer text-xs text-blue-500 hover:underline"
            >
              恢复默认
            </button>
          </div>
        )}

        {manualMode && (
          <ManualLocationMap
            onConfirm={handleMapConfirm}
            onBack={handleMapBack}
          />
        )}

        {location && !manualMode && (
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="mt-3 w-full cursor-pointer text-center text-xs text-gray-500 transition-colors hover:text-gray-700"
          >
            🗺️ 在地图上微调位置（可选）
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
        <p className="mb-3 text-sm font-semibold text-gray-700">出行方式</p>
        <div className="grid grid-cols-4 gap-2">
          {TRANSPORTS.map((t) => (
            <motion.button
              key={t.id}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setTransport(t.id)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl py-3 text-center transition-colors ${
                transport === t.id
                  ? "bg-orange-500 text-white shadow-md"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="text-xs font-semibold">{t.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <motion.button
        type="button"
        whileTap={canProceed ? { scale: 0.96 } : undefined}
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full cursor-pointer rounded-full bg-white py-4 text-base font-bold text-orange-600 shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一步 →
      </motion.button>
    </div>
  );
}
