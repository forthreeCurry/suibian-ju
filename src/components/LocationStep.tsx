"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { smartLocate, reverseGeocode, type LocationResult } from "@/src/lib/location-service";
import { getCachedLocation, setCachedLocation } from "@/src/lib/location-cache";

const ManualLocationMap = dynamic(() => import("./ManualLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-500">
      地图加载中…
    </div>
  ),
});

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

type LocateState = "idle" | "locating" | "success" | "error";

const SOURCE_LABELS: Record<LocationResult["source"], string> = {
  gps: "GPS 精确定位",
  network: "网络定位",
  wifi: "WiFi 定位",
  ip: "IP 粗略定位",
};

export default function LocationStep({ onComplete }: LocationStepProps) {
  const [locateState, setLocateState] = useState<LocateState>("idle");
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locateSource, setLocateSource] = useState<LocationResult["source"] | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [transport, setTransport] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  // ---- auto locate on mount ----
  useEffect(() => {
    doLocate();
  }, []);

  const doLocate = useCallback(async () => {
    // 先检查缓存
    const cached = getCachedLocation();
    if (cached) {
      const addr = await reverseGeocode(cached.latitude, cached.longitude);
      setLocation({ lat: cached.latitude, lon: cached.longitude, address: addr });
      setLocateSource(cached.source);
      setLocateState("success");
      return;
    }

    setLocateState("locating");
    setLocateError(null);

    try {
      const result = await smartLocate();
      setCachedLocation(result);
      const addr = await reverseGeocode(result.latitude, result.longitude);
      setLocation({ lat: result.latitude, lon: result.longitude, address: addr });
      setLocateSource(result.source);
      setLocateState("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "定位失败";
      setLocateError(msg);
      setLocateState("error");
    }
  }, []);

  // ---- manual entry ----
  const handleManualSubmit = useCallback(() => {
    const addr = manualAddress.trim();
    if (!addr) return;
    setLocation({ address: addr });
    setLocateSource("ip");
    setLocateState("success");
    setManualMode(false);
  }, [manualAddress]);

  // ---- map picker ----
  const handleMapConfirm = useCallback(
    (lat: number, lon: number, address: string) => {
      const loc: LocationData = { lat, lon, address };
      setLocation(loc);
      setCachedLocation({
        latitude: lat,
        longitude: lon,
        accuracy: 10,
        source: "gps",
        timestamp: Date.now(),
      });
      setLocateSource("gps");
      setLocateState("success");
      setManualMode(false);
    },
    [],
  );

  const handleMapBack = useCallback(() => setManualMode(false), []);

  const canProceed = !!location && !!transport;

  const handleNext = useCallback(() => {
    if (!location || !transport) return;
    onComplete({ location, transportMode: transport });
  }, [location, transport, onComplete]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white drop-shadow-lg">你从哪出发？</h2>
        <p className="mt-1 text-sm text-white/60">定位仅用于推荐附近餐厅，不会分享给其他人</p>
      </div>

      {/* ---- location card ---- */}
      <div className="rounded-2xl bg-white/90 p-5 shadow-lg backdrop-blur">
        <AnimatePresence mode="wait">
          {/* locating */}
          {locateState === "locating" && (
            <motion.div
              key="locating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="inline-block h-4 w-4 rounded-full bg-blue-400"
              />
              <p className="text-sm font-medium text-blue-600">正在获取您的位置…</p>
              <p className="text-xs text-gray-400">请允许浏览器定位权限</p>
            </motion.div>
          )}

          {/* success */}
          {locateState === "success" && !manualMode && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 text-xl">📍</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">已定位</p>
                  {locateSource && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {SOURCE_LABELS[locateSource]}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm leading-snug text-gray-500 break-words">
                  {location?.address}
                </p>
                <button
                  type="button"
                  onClick={doLocate}
                  className="mt-1 cursor-pointer text-xs text-blue-500 hover:underline"
                >
                  🔄 重新定位
                </button>
              </div>
            </motion.div>
          )}

          {/* error */}
          {locateState === "error" && !manualMode && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm text-red-500">
                <span>⚠️</span>
                <span>{locateError || "定位失败"}</span>
              </div>
              <button
                type="button"
                onClick={doLocate}
                className="cursor-pointer rounded-full bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100"
              >
                🔄 重试
              </button>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="cursor-pointer text-xs text-blue-500 hover:underline"
              >
                📝 手动输入地址
              </button>
            </motion.div>
          )}

          {/* manual input */}
          {manualMode && locateState !== "success" && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <p className="text-sm font-semibold text-gray-700">手动输入地址</p>
              <input
                type="text"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="如：望京 SOHO"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none placeholder:text-gray-300 focus:border-orange-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={!manualAddress.trim()}
                  className="flex-1 cursor-pointer rounded-full bg-orange-500 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                >
                  确认
                </button>
                <button
                  type="button"
                  onClick={() => { setManualMode(false); setManualAddress(""); }}
                  className="cursor-pointer rounded-full bg-gray-100 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-200"
                >
                  取消
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* map tweak (only when positioned) */}
        {location && !manualMode && locateState === "success" && (
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="mt-3 w-full cursor-pointer text-center text-xs text-gray-500 transition-colors hover:text-gray-700"
          >
            🗺️ 在地图上微调位置（可选）
          </button>
        )}

        {/* map picker */}
        {manualMode && locateState === "success" && (
          <ManualLocationMap
            initialLat={location?.lat}
            initialLon={location?.lon}
            onConfirm={handleMapConfirm}
            onBack={handleMapBack}
          />
        )}
      </div>

      {/* ---- transport ---- */}
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

      {/* ---- next ---- */}
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
