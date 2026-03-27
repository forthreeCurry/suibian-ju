"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/src/lib/supabase";
import {
  generateRecommendations,
  type Recommendation,
} from "@/src/lib/ai-recommend";
import {
  getWeather,
  formatWeatherLoadingLine,
  type WeatherSnapshot,
} from "@/src/lib/weather";
import JoinRoomModal from "./JoinRoomModal";
import LocationStep from "./LocationStep";
import SwipeCards, { type TasteRatings } from "./SwipeCards";
import PrivacyForm from "./PrivacyForm";
import AILoading from "./AILoading";
import { seedDemoMembersForRoom } from "@/src/lib/demoBots";

// ----- types -----

interface Room {
  id: string;
  short_code: string;
  host_id: string;
  status: string;
  name: string | null;
  max_members: number;
}

interface Member {
  id: string;
  nickname: string;
  avatar_url: string | null;
  joined_at: string;
}

interface LocationData {
  lat?: number;
  lon?: number;
  address: string;
}

type UserStep =
  | "waiting_to_start"
  | "departing"
  | "step_location"
  | "step_budget"
  | "step_taste"
  | "submitting"
  | "waiting_for_result"
  | "ai_calculating"
  | "ai_results";

const WIZARD_LABELS = ["出发地", "预算忌口", "口味"] as const;

function formatBudgetRangeLabel(budget: string | undefined | null) {
  if (!budget) return undefined;
  const m = budget.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return `¥${m[1]} — ¥${m[2]}`;
  return budget;
}

function truncateGeoLabel(text: string, max = 22) {
  const t = text.trim();
  if (!t.length) return undefined;
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function cuisineEmoji(cuisine: string) {
  if (/火锅|涮/.test(cuisine)) return "🍲";
  if (/烤|烧/.test(cuisine)) return "🥩";
  if (/轻食|沙拉|素食/.test(cuisine)) return "🥗";
  if (/海鲜|鱼|蒸汽/.test(cuisine)) return "🦞";
  if (/日料|和食/.test(cuisine)) return "🍣";
  if (/面|粉|米/.test(cuisine)) return "🍜";
  if (/西餐|牛排|融合西/.test(cuisine)) return "🍽️";
  if (/简餐|便当/.test(cuisine)) return "🍱";
  return "🍴";
}

function weatherResultHint(w: WeatherSnapshot | null): string | null {
  if (!w) return null;
  if (/雨|阵雨|雷暴|雪/.test(w.description)) {
    return `明日「${w.description}」，推荐以室内餐厅为主，出门记得带伞`;
  }
  if (w.temp_max >= 32) {
    return `明日最高约 ${Math.round(w.temp_max)}°C，已优先有空调的餐厅`;
  }
  return null;
}

// ----- constants -----

const stageMotion = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

function PreferenceStepper({ step }: { step: UserStep }) {
  const meta = (() => {
    switch (step) {
      case "step_location":
        return { completed: 0, active: 0 };
      case "step_budget":
        return { completed: 1, active: 1 };
      case "step_taste":
        return { completed: 2, active: 2 };
      case "submitting":
        return { completed: 2, active: 2, loading: true as const };
      case "waiting_for_result":
        return { completed: 3, active: -1 };
      default:
        return null;
    }
  })();

  if (!meta) return null;

  const { completed, active } = meta;
  const loading = "loading" in meta && meta.loading;
  const line01Done = completed >= 1;
  const line12Done = completed >= 2;

  const dot = (i: number) => {
    const done = i < completed;
    const current = active >= 0 && i === active;
    const showPulse =
      (current && !done) || (loading && i === 2 && !done);
    return (
      <div className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1">
        <motion.div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-md ${
            done
              ? "bg-emerald-500 text-white"
              : current
                ? "bg-white text-orange-600 ring-2 ring-white/80"
                : "bg-white/25 text-white/70"
          }`}
          animate={showPulse ? { scale: [1, 1.07, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.15 }}
        >
          {done ? "✓" : i + 1}
        </motion.div>
        <span
          className={`text-center text-[10px] font-semibold leading-tight ${
            current || done ? "text-white" : "text-white/50"
          }`}
        >
          {WIZARD_LABELS[i]}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-3 flex w-full max-w-xs flex-col items-center gap-1.5 px-2">
      <div className="flex w-full items-start justify-center">
        {dot(0)}
        <div
          className={`mt-[18px] mx-1 h-0.5 min-w-[12px] flex-1 max-w-[48px] rounded-full ${
            line01Done ? "bg-emerald-400" : "bg-white/25"
          }`}
        />
        {dot(1)}
        <div
          className={`mt-[18px] mx-1 h-0.5 min-w-[12px] flex-1 max-w-[48px] rounded-full ${
            line12Done ? "bg-emerald-400" : "bg-white/25"
          }`}
        />
        {dot(2)}
      </div>
      {loading && (
        <p className="text-xs font-medium text-white/80">正在提交偏好…</p>
      )}
    </div>
  );
}

// ----- component -----

export default function RoomClient({ id: shortCode }: { id: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [userStep, setUserStep] = useState<UserStep>("waiting_to_start");
  const [tasteRatings, setTasteRatings] = useState<TasteRatings | null>(null);
  const [userLocation, setUserLocation] = useState<{
    location: LocationData;
    transportMode: string;
  } | null>(null);
  const [budgetPrefs, setBudgetPrefs] = useState<{
    budget: string;
    restrictions: string[];
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedMemberIds, setSubmittedMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [generateLoading, setGenerateLoading] = useState(false);
  const [aiWeatherLine, setAiWeatherLine] = useState<string | undefined>();
  const [resultRecs, setResultRecs] = useState<Recommendation[]>([]);
  const [resultWeather, setResultWeather] = useState<WeatherSnapshot | null>(
    null,
  );
  const [resultLoaded, setResultLoaded] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const submitLockRef = useRef(false);

  const showWizardProgress =
    userStep === "step_location" ||
    userStep === "step_budget" ||
    userStep === "step_taste" ||
    userStep === "submitting";

  // ---- 1. fetch room + members + identity check ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("id, short_code, host_id, status, name, max_members")
        .eq("short_code", shortCode)
        .single();

      if (roomErr || !roomData) {
        if (!cancelled) setError("房间不存在或已失效");
        return;
      }
      if (!cancelled) setRoom(roomData);

      const { data: membersData } = await supabase
        .from("members")
        .select("id, nickname, avatar_url, joined_at")
        .eq("room_id", roomData.id)
        .order("joined_at", { ascending: true });

      if (!cancelled) setMembers(membersData ?? []);

      const storedMemberId = localStorage.getItem("memberId");
      const storedRoomId = localStorage.getItem("roomId");

      if (
        storedMemberId &&
        storedRoomId === roomData.id &&
        membersData?.some((m) => m.id === storedMemberId)
      ) {
        if (!cancelled) setMemberId(storedMemberId);
        if (
          !cancelled &&
          roomData.status === "calculating" &&
          membersData?.some((m) => m.id === storedMemberId)
        ) {
          setUserStep("ai_calculating");
        }
        if (
          !cancelled &&
          roomData.status === "finished" &&
          membersData?.some((m) => m.id === storedMemberId)
        ) {
          setUserStep("ai_results");
        }
      }

      if (!cancelled) setInitDone(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [shortCode]);

  const memberIdsKey = useMemo(
    () => [...members].map((m) => m.id).sort().join(","),
    [members],
  );

  // ---- 1b. MVP：房主进房且仍在等人时，自动补 1～2 个演示成员（与首页创建时插入二选一，sessionStorage 去重）----
  useEffect(() => {
    if (!initDone || !room || room.status !== "waiting") return;
    if (members.length === 0 || members.length >= 3) return;
    const mid = memberId ?? localStorage.getItem("memberId");
    if (!mid || mid !== room.host_id) return;

    void seedDemoMembersForRoom(room.id, members.length);
  }, [
    initDone,
    room?.id,
    room?.status,
    room?.host_id,
    members.length,
    memberId,
  ]);

  // ---- 2. realtime: members + rooms + preferences (同房间成员) ----
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "members",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const newMember = payload.new as Member;
          setMembers((prev) =>
            prev.some((m) => m.id === newMember.id)
              ? prev
              : [...prev, newMember],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const updated = payload.new as Room;
          setRoom((prev) =>
            prev ? { ...prev, status: updated.status } : prev,
          );
        },
      );

    if (memberIdsKey.length > 0) {
      const prefFilter = `member_id=in.(${memberIdsKey})`;
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "preferences",
          filter: prefFilter,
        },
        (payload) => {
          const row = payload.new as { member_id?: string };
          if (!row.member_id) return;
          setSubmittedMemberIds((prev) => {
            const next = new Set(prev);
            next.add(row.member_id!);
            return next;
          });
        },
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, memberIdsKey]);

  // ---- 2b. 等待大厅：拉取已提交成员 ----
  useEffect(() => {
    if (!room || members.length === 0) return;
    if (userStep !== "waiting_for_result") return;

    const ids = members.map((m) => m.id);
    let cancelled = false;

    void supabase
      .from("preferences")
      .select("member_id")
      .in("member_id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        setSubmittedMemberIds(
          new Set(data?.map((p) => p.member_id as string) ?? []),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [room?.id, userStep, memberIdsKey]);

  // ---- 2c. 房主触发 AI → 全员进入计算阶段 ----
  useEffect(() => {
    if (!room || room.status !== "calculating") return;
    setUserStep((prev) => {
      if (prev === "waiting_to_start" || prev === "departing") return prev;
      if (prev === "ai_results") return prev;
      return "ai_calculating";
    });
  }, [room?.status]);

  // ---- 2d. 推荐写入完成 → 离开终端动画页 ----
  useEffect(() => {
    if (!room || room.status !== "finished") return;
    setUserStep((prev) => (prev === "ai_calculating" ? "ai_results" : prev));
  }, [room?.status]);

  // ---- 2e. 结果页：拉取 recommendations / 天气快照 ----
  useEffect(() => {
    if (userStep !== "ai_results" || !room?.id) {
      setResultRecs([]);
      setResultWeather(null);
      setResultLoaded(false);
      return;
    }

    const roomId = room.id;
    let cancelled = false;
    setResultLoaded(false);

    void supabase
      .from("results")
      .select("recommendations, weather_info")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setResultRecs([]);
          setResultWeather(null);
          setResultLoaded(true);
          return;
        }
        if (Array.isArray(data.recommendations)) {
          setResultRecs(data.recommendations as Recommendation[]);
        } else {
          setResultRecs([]);
        }
        if (data.weather_info && typeof data.weather_info === "object") {
          setResultWeather(data.weather_info as WeatherSnapshot);
        } else {
          setResultWeather(null);
        }
        setResultLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userStep, room?.id]);

  const resultWeatherHintText = useMemo(
    () => weatherResultHint(resultWeather),
    [resultWeather],
  );

  // ---- 计算动画：从 results 读取本轮天气，供终端日志第 3 行展示 ----
  useEffect(() => {
    if (userStep !== "ai_calculating" || !room?.id) {
      setAiWeatherLine(undefined);
      return;
    }

    const roomId = room.id;
    let cancelled = false;

    function applyRow(row: { weather_info: unknown } | null) {
      if (!row?.weather_info || typeof row.weather_info !== "object") return;
      const w = row.weather_info as Partial<WeatherSnapshot>;
      if (typeof w.temp_max !== "number" || typeof w.description !== "string")
        return;
      setAiWeatherLine(
        formatWeatherLoadingLine(w as WeatherSnapshot),
      );
    }

    function load() {
      void supabase
        .from("results")
        .select("weather_info")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || error) return;
          applyRow(data);
        });
    }

    load();
    const t1 = window.setTimeout(load, 400);
    const t2 = window.setTimeout(load, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [userStep, room?.id]);

  // ---- 3. room status → userStep transitions ----
  useEffect(() => {
    if (!room || room.status !== "voting") return;
    if (userStep !== "waiting_to_start") return;
    setUserStep("departing");
  }, [room?.status, userStep]);

  // ---- 4. departing → step_location ----
  useEffect(() => {
    if (userStep !== "departing") return;
    const timer = setTimeout(() => setUserStep("step_location"), 2000);
    return () => clearTimeout(timer);
  }, [userStep]);

  // ---- 5. submitting → Supabase (once) ----
  useEffect(() => {
    if (userStep !== "submitting") {
      submitLockRef.current = false;
      return;
    }
    if (submitLockRef.current) return;

    const mid = memberId ?? localStorage.getItem("memberId");
    if (!mid || !userLocation || !budgetPrefs || !tasteRatings) {
      console.error("Missing preference data for submit");
      setUserStep("step_location");
      return;
    }

    submitLockRef.current = true;
    setSubmitError(null);

    void (async () => {
      const mode =
        userLocation.transportMode === "car"
          ? "drive"
          : userLocation.transportMode;

      const { error: err } = await supabase.from("preferences").insert({
        member_id: mid,
        budget: budgetPrefs.budget,
        dietary_restrictions: budgetPrefs.restrictions,
        taste_likes: tasteRatings,
        departure_location: { ...userLocation.location },
        transport_mode: mode,
      });

      if (err) {
        console.error("Failed to save preferences:", err);
        submitLockRef.current = false;
        setSubmitError("提交失败，请重试");
        setUserStep("step_taste");
        return;
      }

      setSubmittedMemberIds((prev) => {
        const next = new Set(prev);
        next.add(mid);
        return next;
      });
      setUserStep("waiting_for_result");
    })();
  }, [
    userStep,
    memberId,
    userLocation,
    budgetPrefs,
    tasteRatings,
  ]);

  // ---- handlers ----

  const handleJoinSuccess = useCallback((newMemberId: string) => {
    setMemberId(newMemberId);
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${shortCode}`,
      );
    } catch {
      /* ignore */
    }
  }, [shortCode]);

  const handleCopyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shortCode);
    } catch {
      /* ignore */
    }
  }, [shortCode]);

  const handleStart = useCallback(async () => {
    if (!room) return;
    const { error: err } = await supabase
      .from("rooms")
      .update({ status: "voting" })
      .eq("id", room.id);
    if (err) console.error("Failed to start room:", err);
  }, [room]);

  const handleLocationComplete = useCallback(
    (data: { location: LocationData; transportMode: string }) => {
      setUserLocation(data);
      setUserStep("step_budget");
    },
    [],
  );

  const handleBudgetSubmit = useCallback(
    (budget: string, restrictions: string[]) => {
      setBudgetPrefs({ budget, restrictions });
      setUserStep("step_taste");
    },
    [],
  );

  const handleTasteComplete = useCallback((result: TasteRatings) => {
    setTasteRatings(result);
    setUserStep("submitting");
  }, []);

  // ---- derived state ----
  const isHost = !!(memberId && room && room.host_id === memberId);
  const needsJoin = initDone && !memberId;
  const canStart = members.length >= 2;
  const submittedCount = submittedMemberIds.size;
  const memberTotal = members.length;
  const canTriggerAI = isHost && submittedCount >= 1 && room?.status === "voting";

  const aiBudgetRange = useMemo(
    () => formatBudgetRangeLabel(budgetPrefs?.budget),
    [budgetPrefs?.budget],
  );
  const aiGeoArea = useMemo(() => {
    const addr = userLocation?.location.address?.trim();
    return addr ? truncateGeoLabel(addr) : undefined;
  }, [userLocation?.location.address]);

  const handleGenerateAI = useCallback(async () => {
    if (!room || !isHost || !memberId || generateLoading) return;
    setGenerateLoading(true);

    let weatherInfo: WeatherSnapshot | null = null;
    const { data: pref } = await supabase
      .from("preferences")
      .select("departure_location")
      .eq("member_id", memberId)
      .maybeSingle();

    const loc = pref?.departure_location as
      | { lat?: unknown; lon?: unknown; lng?: unknown }
      | null
      | undefined;
    const lat = typeof loc?.lat === "number" ? loc.lat : undefined;
    const lng =
      typeof loc?.lon === "number"
        ? loc.lon
        : typeof loc?.lng === "number"
          ? loc.lng
          : undefined;

    if (lat !== undefined && lng !== undefined) {
      try {
        weatherInfo = await getWeather(lat, lng);
      } catch (e) {
        console.error("Weather fetch failed:", e);
      }
    }

    const { error: insertErr } = await supabase.from("results").insert({
      room_id: room.id,
      recommendations: [],
      weather_info: weatherInfo,
    });
    if (insertErr) console.error("Failed to insert results row:", insertErr);

    const { error: err } = await supabase
      .from("rooms")
      .update({ status: "calculating" })
      .eq("id", room.id);

    setGenerateLoading(false);
    if (err) console.error("Failed to start AI:", err);
  }, [room, isHost, memberId, generateLoading]);

  // ---- renders ----

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 px-6 text-center">
        <span className="text-5xl">😵</span>
        <h1 className="mt-4 text-2xl font-bold text-white">{error}</h1>
      </div>
    );
  }

  if (!initDone) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500">
        <motion.span
          className="text-5xl"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        >
          🍳
        </motion.span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 select-none">
      {needsJoin && room && (
        <JoinRoomModal
          roomId={room.id}
          roomName={room.name}
          roomStatus={room.status}
          maxMembers={room.max_members}
          currentCount={members.length}
          onSuccess={handleJoinSuccess}
        />
      )}

      <header className="flex flex-col px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
            房间号：{shortCode}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={handleCopyLink}
            className="cursor-pointer rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            📋 复制链接
          </motion.button>
        </div>
        {showWizardProgress && (
          <PreferenceStepper step={userStep} />
        )}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
        <AnimatePresence mode="wait">
          {userStep === "waiting_to_start" && (
            <motion.div
              key="lobby"
              {...stageMotion}
              className="flex w-full max-w-sm flex-col items-center gap-6"
            >
              <motion.h2
                className="text-3xl font-extrabold text-white drop-shadow-lg"
                key={members.length}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                已集结 {members.length} 位干饭人
              </motion.h2>

              <div className="grid w-full grid-cols-3 gap-3">
                <AnimatePresence>
                  {members.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, scale: 0.5, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{
                        delay: i * 0.06,
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/20 py-4 backdrop-blur"
                    >
                      <span className="text-3xl">
                        {m.avatar_url || "😀"}
                      </span>
                      <span className="max-w-[5rem] truncate text-sm font-semibold text-white">
                        {m.nickname}
                      </span>
                      {room && m.id === room.host_id && (
                        <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] font-bold text-white">
                          发起人
                        </span>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-4 w-full">
                {isHost ? (
                  <motion.button
                    type="button"
                    whileTap={canStart ? { scale: 0.95 } : undefined}
                    onClick={handleStart}
                    disabled={!canStart}
                    className="w-full cursor-pointer rounded-full bg-white py-4 text-lg font-bold text-orange-600 shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {canStart
                      ? "🔒 锁定房间，开始填写偏好"
                      : "再等个人吧...至少 2 人才能开始"}
                  </motion.button>
                ) : (
                  <motion.p
                    className="text-center text-base font-medium text-white/60"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    等待发起人发车...
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {userStep === "departing" && (
            <motion.div
              key="departing"
              {...stageMotion}
              className="flex flex-col items-center gap-4 text-center"
            >
              <motion.span
                className="text-6xl"
                animate={{ x: [0, 10, -10, 10, 0] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
              >
                🚗
              </motion.span>
              <h2 className="text-2xl font-extrabold text-white drop-shadow-lg">
                滴滴滴！发车成功
              </h2>
              <p className="text-base text-white/70">
                接下来请填写出发地、预算与口味
              </p>
            </motion.div>
          )}

          {userStep === "step_location" && (
            <motion.div key="step_location" {...stageMotion}>
              <LocationStep onComplete={handleLocationComplete} />
            </motion.div>
          )}

          {userStep === "step_budget" && (
            <motion.div key="step_budget" {...stageMotion}>
              <PrivacyForm
                skipSuccessScreen
                submitLabel="下一步：口味评分 →"
                onSubmit={handleBudgetSubmit}
              />
            </motion.div>
          )}

          {userStep === "step_taste" && (
            <motion.div key="step_taste" {...stageMotion}>
              {submitError && (
                <p className="mb-3 text-center text-sm font-medium text-red-200">
                  {submitError}
                </p>
              )}
              <SwipeCards onComplete={handleTasteComplete} />
            </motion.div>
          )}

          {userStep === "submitting" && (
            <motion.div
              key="submitting"
              {...stageMotion}
              className="flex flex-col items-center gap-6 py-16 text-center"
            >
              <motion.span
                className="text-6xl"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              >
                📤
              </motion.span>
              <h2 className="text-xl font-bold text-white drop-shadow">
                正在保存你的偏好…
              </h2>
            </motion.div>
          )}

          {userStep === "waiting_for_result" && (
            <motion.div
              key="waiting_for_result"
              {...stageMotion}
              className="flex w-full max-w-sm flex-col items-stretch gap-5"
            >
              <h2 className="text-center text-2xl font-extrabold text-white drop-shadow-lg">
                ✅ 你已提交！
              </h2>

              <div className="flex flex-col items-center gap-2">
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg
                    className="h-full w-full -rotate-90"
                    viewBox="0 0 36 36"
                    aria-hidden
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="rgb(52 211 153)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${
                        memberTotal === 0
                          ? 0
                          : (submittedCount / memberTotal) * 97.4
                      }, 97.4`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                    <span className="text-2xl font-black tabular-nums">
                      {submittedCount}/{memberTotal || 1}
                    </span>
                    <span className="text-[10px] font-semibold text-white/70">
                      人已完成
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium text-white/80">
                  等人齐后由发起人一键生成推荐
                </p>
              </div>

              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                <p className="mb-2 text-center text-xs font-semibold text-white/60">
                  成员状态
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {members.map((m) => {
                    const done = submittedMemberIds.has(m.id);
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2"
                      >
                        <span className="text-2xl">{m.avatar_url || "😀"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">
                            {m.nickname}
                            {room && m.id === room.host_id && (
                              <span className="ml-1 text-[10px] text-amber-200">
                                发起人
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-white/90">
                          {done ? "✅ 已完成" : "⏳ 进行中"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {isHost && (
                <motion.button
                  type="button"
                  whileTap={canTriggerAI && !generateLoading ? { scale: 0.97 } : undefined}
                  onClick={handleGenerateAI}
                  disabled={!canTriggerAI || generateLoading}
                  className="w-full cursor-pointer rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-4 text-base font-bold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generateLoading
                    ? "启动中…"
                    : "🚀 立即生成 AI 推荐"}
                </motion.button>
              )}

              <div className="rounded-2xl border border-white/20 bg-black/10 px-4 py-3 text-center backdrop-blur">
                <p className="text-xs font-medium text-white/50">房间邀请码</p>
                <p className="mt-1 font-mono text-2xl font-black tracking-[0.2em] text-white">
                  {shortCode}
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={handleCopyRoomCode}
                  className="mt-2 text-xs font-semibold text-amber-200 underline decoration-dotted"
                >
                  复制号码去催人
                </motion.button>
              </div>
            </motion.div>
          )}

          {userStep === "ai_calculating" && (
            <motion.div
              key="ai_calculating"
              {...stageMotion}
              className="flex w-full flex-col items-center gap-5 py-4"
            >
              <h2 className="text-center text-lg font-bold text-white drop-shadow">
                AI 正在撮合大家的口味
              </h2>
              <AILoading
                memberCount={Math.max(1, memberTotal)}
                budgetRange={aiBudgetRange}
                geoArea={aiGeoArea}
                weatherLine={aiWeatherLine}
                onComplete={() => {
                  if (!room?.id) return;
                  if (isHost) {
                    void (async () => {
                      try {
                        await generateRecommendations(room.id);
                      } catch (e) {
                        console.error("generateRecommendations failed:", e);
                      }
                      setUserStep("ai_results");
                    })();
                  }
                }}
              />
            </motion.div>
          )}

          {userStep === "ai_results" && (
            <motion.div
              key="ai_results"
              {...stageMotion}
              className="flex w-full max-w-md flex-col gap-4 px-1 py-4"
            >
              <div className="text-center">
                <h2 className="text-2xl font-black text-white drop-shadow">
                  🎯 AI 为你们精选了 3 个好去处
                </h2>
                {resultWeatherHintText && (
                  <p className="mt-2 rounded-xl border border-white/25 bg-black/15 px-3 py-2 text-xs leading-relaxed text-white/85">
                    {resultWeatherHintText}
                  </p>
                )}
              </div>
              {!resultLoaded && (
                <div className="flex flex-col items-center gap-3 py-10 text-white/90">
                  <motion.span
                    className="text-4xl"
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.2,
                      ease: "linear",
                    }}
                  >
                    🎯
                  </motion.span>
                  <p className="text-sm font-medium">正在加载推荐结果…</p>
                </div>
              )}
              {resultLoaded && resultRecs.length === 0 && (
                <p className="rounded-2xl border border-white/25 bg-black/15 px-4 py-6 text-center text-sm text-white/85">
                  暂时没有推荐数据，请让发起人重新生成，或稍后再试。
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {resultLoaded &&
                  resultRecs.map((r, i) => (
                  <li
                    key={`${r.name}-${i}`}
                    className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
                  >
                    {i === 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-black text-white shadow">
                        👑 最佳匹配
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">
                        {cuisineEmoji(r.cuisine)}
                      </span>
                      <div
                        className={`min-w-0 flex-1 ${i === 0 ? "pr-16" : ""}`}
                      >
                        <p className="text-xs font-bold text-orange-600">
                          第 {i + 1} 名 · {r.cuisine}
                        </p>
                        <p className="truncate text-base font-bold text-zinc-900">
                          {r.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-zinc-700">
                          人均 ¥{r.avgPrice} · 口碑 {r.rating.toFixed(1)} 星 ·
                          匹配度{" "}
                          <span className="text-orange-600">
                            {r.matchScore}%
                          </span>
                        </p>
                        {r.tags.length > 0 && (
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {r.tags.slice(0, 4).join(" · ")}
                          </p>
                        )}
                        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                          {r.reason}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center gap-6 border-t border-zinc-200/80 pt-2">
                      <button
                        type="button"
                        disabled
                        className="text-lg opacity-40 grayscale"
                        title="投票即将上线"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        disabled
                        className="text-lg opacity-40 grayscale"
                        title="投票即将上线"
                      >
                        👎
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="rounded-xl border border-white/20 bg-black/15 px-3 py-2 text-center text-[11px] leading-relaxed text-white/75">
                本次决策由 AI 全权负责，如有难吃，请痛骂 AI 🤖
              </p>
              <div className="flex flex-col gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCopyLink}
                  className="w-full rounded-full bg-white py-3 text-sm font-bold text-orange-600 shadow-md"
                >
                  📤 分享结果给大家
                </motion.button>
                <Link
                  href="/"
                  className="block w-full rounded-full border-2 border-white/80 bg-white/10 py-3 text-center text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  🔄 再来一局
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
