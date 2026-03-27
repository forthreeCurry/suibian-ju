"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/src/lib/supabase";
import { seedDemoMembersForRoom } from "@/src/lib/demoBots";

const AVATARS = [
  "🐱", "🐶", "🐼", "🦊", "🐸", "🐯", "🐷", "🐵",
  "🐰", "🦁", "🐻", "🐨", "🐮", "🐔", "🐙", "🦄",
];

type ModalStep = "scene" | "setup";
type Scene = "instant" | "planned";

function generateShortCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: "easeOut" as const },
  }),
};

const modalMotion = {
  initial: { opacity: 0, scale: 0.92, y: 24 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 12 },
  transition: { type: "spring" as const, stiffness: 400, damping: 28 },
};

export default function Home() {
  const router = useRouter();

  // modal state
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("scene");

  // create form state
  const [scene, setScene] = useState<Scene>("instant");
  const [roomName, setRoomName] = useState("");
  const [nickname, setNickname] = useState("");
  const [maxMembers, setMaxMembers] = useState(6);
  const [dateTime, setDateTime] = useState("");
  const [locationStrategy, setLocationStrategy] = useState<"smart" | "manual">("smart");
  const [loading, setLoading] = useState(false);

  // join state
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);

  const nicknameRef = useRef<HTMLInputElement>(null);
  const joinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreate && modalStep === "setup") {
      setTimeout(() => nicknameRef.current?.focus(), 120);
    }
  }, [showCreate, modalStep]);

  useEffect(() => {
    if (showJoin) setTimeout(() => joinRef.current?.focus(), 120);
  }, [showJoin]);

  // ---- create room ----
  const handleCreate = useCallback(async () => {
    if (!nickname.trim() || loading) return;
    setLoading(true);

    try {
      const shortCode = generateShortCode();
      const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          short_code: shortCode,
          host_id: "pending",
          status: "waiting",
          name: roomName.trim() || null,
          scene,
          max_members: maxMembers,
          date_time: scene === "planned" && dateTime ? dateTime : null,
          location_strategy: scene === "planned" ? locationStrategy : "smart",
          budget_mode: "anonymous",
        })
        .select("id")
        .single();

      if (roomErr || !room) throw roomErr ?? new Error("创建房间失败");

      const { data: member, error: memberErr } = await supabase
        .from("members")
        .insert({ room_id: room.id, nickname: nickname.trim(), avatar_url: avatar })
        .select("id")
        .single();

      if (memberErr || !member) throw memberErr ?? new Error("创建成员失败");

      await supabase.from("rooms").update({ host_id: member.id }).eq("id", room.id);

      localStorage.setItem("memberId", member.id);
      localStorage.setItem("roomId", room.id);

      await seedDemoMembersForRoom(room.id, 1);

      try { await navigator.clipboard.writeText(shortCode); } catch { /* ignore */ }

      setShowCreate(false);
      setToast(`房间 ${shortCode} 已创建，快去摇人！`);
      setTimeout(() => router.push(`/room/${shortCode}`), 900);
    } catch (err) {
      console.error(err);
      setToast("创建失败，请重试");
      setLoading(false);
    }
  }, [nickname, roomName, scene, maxMembers, dateTime, locationStrategy, loading, router]);

  // ---- join room ----
  const handleJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (code.length !== 6) { setJoinError("请输入 6 位房间号"); return; }
    setJoinError(null);

    const { data } = await supabase
      .from("rooms")
      .select("id")
      .eq("short_code", code)
      .single();

    if (!data) { setJoinError("房间不存在，请检查号码"); return; }
    router.push(`/room/${code}`);
  }, [joinCode, router]);

  // ---- reset on close ----
  const closeCreate = useCallback(() => {
    if (loading) return;
    setShowCreate(false);
    setModalStep("scene");
    setScene("instant");
    setRoomName("");
    setNickname("");
    setMaxMembers(6);
    setDateTime("");
    setLoading(false);
  }, [loading]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 px-6 py-10 text-center select-none">
      {/* decorative */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-yellow-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-64 w-64 rounded-full bg-pink-300/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-1/4 h-56 w-56 rounded-full bg-orange-200/40 blur-3xl" />

      {/* hero */}
      <motion.div className="mt-12 flex flex-col items-center gap-3" initial="hidden" animate="visible">
        <motion.h1
          custom={0}
          variants={fadeInUp}
          className="max-w-xs text-4xl leading-tight font-extrabold tracking-tight text-white drop-shadow-lg"
        >
          谁再喊随便，
          <br />
          今晚谁买单！
        </motion.h1>
        <motion.p custom={1} variants={fadeInUp} className="text-base font-medium text-white/80">
          3分钟搞定世纪难题
        </motion.p>
      </motion.div>

      {/* dual entry cards */}
      <motion.div
        className="mt-10 flex w-full max-w-sm flex-col gap-4"
        initial="hidden"
        animate="visible"
      >
        <motion.button
          custom={2}
          variants={fadeInUp}
          whileTap={{ scale: 0.97 }}
          onClick={() => { setShowCreate(true); setModalStep("scene"); }}
          className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white/95 p-5 text-left shadow-lg backdrop-blur transition-shadow hover:shadow-xl"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 text-2xl shadow-md">
            🔥
          </span>
          <div>
            <h3 className="text-lg font-bold text-gray-800">发起聚餐</h3>
            <p className="text-sm text-gray-400">我来组局，大家跟上</p>
          </div>
        </motion.button>

        <motion.button
          custom={3}
          variants={fadeInUp}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowJoin(true)}
          className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white/95 p-5 text-left shadow-lg backdrop-blur transition-shadow hover:shadow-xl"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 text-2xl shadow-md">
            🎫
          </span>
          <div>
            <h3 className="text-lg font-bold text-gray-800">加入房间</h3>
            <p className="text-sm text-gray-400">输入房间号，马上开吃</p>
          </div>
        </motion.button>
      </motion.div>

      {/* history placeholder */}
      <motion.div
        custom={4}
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="mt-10 w-full max-w-sm"
      >
        <h4 className="mb-2 text-left text-sm font-semibold text-white/60">最近的局</h4>
        <div className="rounded-2xl border border-white/15 bg-white/10 py-8 text-center backdrop-blur">
          <p className="text-sm text-white/40">还没有历史记录哦</p>
        </div>
      </motion.div>

      {/* footer */}
      <p className="mt-auto pt-8 text-xs text-white/40">随便聚 · 让选择不再纠结</p>

      {/* ====== CREATE MODAL ====== */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}
          >
            <AnimatePresence mode="wait">
              {/* Step 1 — Scene */}
              {modalStep === "scene" && (
                <motion.div key="scene" {...modalMotion} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                  <h2 className="text-lg font-bold text-gray-800">选择聚餐场景</h2>
                  <p className="mt-1 text-sm text-gray-400">先定大方向</p>

                  <div className="mt-5 flex flex-col gap-3">
                    <button
                      onClick={() => { setScene("instant"); setModalStep("setup"); }}
                      className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-transparent bg-orange-50 p-4 text-left transition-colors hover:border-orange-300"
                    >
                      <span className="text-3xl">⚡</span>
                      <div>
                        <h3 className="font-bold text-gray-800">即时聚</h3>
                        <p className="text-sm text-gray-400">现在就要吃！按当前位置找</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setScene("planned"); setModalStep("setup"); }}
                      className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-transparent bg-indigo-50 p-4 text-left transition-colors hover:border-indigo-300"
                    >
                      <span className="text-3xl">📅</span>
                      <div>
                        <h3 className="font-bold text-gray-800">提前聚</h3>
                        <p className="text-sm text-gray-400">提前约好，选定商圈和时间</p>
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={closeCreate}
                    className="mt-4 w-full cursor-pointer text-center text-sm text-gray-400 transition-colors hover:text-gray-600"
                  >
                    取消
                  </button>
                </motion.div>
              )}

              {/* Step 2 — Setup */}
              {modalStep === "setup" && (
                <motion.div key="setup" {...modalMotion} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModalStep("scene")}
                      className="cursor-pointer text-lg text-gray-400 transition-colors hover:text-gray-600"
                    >
                      ←
                    </button>
                    <h2 className="text-lg font-bold text-gray-800">
                      {scene === "instant" ? "⚡ 即时聚设置" : "📅 提前聚设置"}
                    </h2>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    {/* room name */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-500">聚餐名称（选填）</label>
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder="周五火锅局"
                        maxLength={20}
                        disabled={loading}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none placeholder:text-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
                      />
                    </div>

                    {/* nickname */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-500">你的昵称 *</label>
                      <input
                        ref={nicknameRef}
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                        placeholder="干饭王小明"
                        maxLength={12}
                        disabled={loading}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none placeholder:text-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
                      />
                    </div>

                    {/* max members stepper */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-500">人数上限</label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setMaxMembers((v) => Math.max(2, v - 1))}
                          disabled={loading}
                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-10 text-center text-xl font-bold text-gray-800">{maxMembers}</span>
                        <button
                          onClick={() => setMaxMembers((v) => Math.min(10, v + 1))}
                          disabled={loading}
                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40"
                        >
                          +
                        </button>
                        <span className="text-sm text-gray-400">人</span>
                      </div>
                    </div>

                    {/* planned-only fields */}
                    {scene === "planned" && (
                      <>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-500">聚餐时间</label>
                          <input
                            type="datetime-local"
                            value={dateTime}
                            onChange={(e) => setDateTime(e.target.value)}
                            disabled={loading}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-500">位置策略</label>
                          <div className="flex gap-2">
                            {(["smart", "manual"] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => setLocationStrategy(s)}
                                disabled={loading}
                                className={`flex-1 cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                                  locationStrategy === s
                                    ? "bg-orange-500 text-white shadow"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                } disabled:opacity-50`}
                              >
                                {s === "smart" ? "🧠 智能推荐" : "📍 手动选区"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* submit */}
                  <motion.button
                    whileTap={loading ? undefined : { scale: 0.96 }}
                    onClick={handleCreate}
                    disabled={loading || !nickname.trim()}
                    className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 py-3.5 text-base font-bold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                          className="inline-block"
                        >
                          ⏳
                        </motion.span>
                        创建中...
                      </>
                    ) : (
                      "创建房间 🚀"
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== JOIN MODAL ====== */}
      <AnimatePresence>
        {showJoin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowJoin(false); setJoinCode(""); setJoinError(null); } }}
          >
            <motion.div {...modalMotion} className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-gray-800">加入房间</h2>
              <p className="mt-1 text-sm text-gray-400">输入朋友发来的 6 位房间号</p>

              <input
                ref={joinRef}
                type="text"
                inputMode="numeric"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setJoinError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                placeholder="000000"
                maxLength={6}
                className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-gray-800 outline-none placeholder:text-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
              />

              {joinError && (
                <p className="mt-2 text-center text-sm text-red-500">{joinError}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleJoin}
                disabled={joinCode.length !== 6}
                className="mt-4 w-full cursor-pointer rounded-full bg-gradient-to-r from-violet-400 to-indigo-500 py-3.5 text-base font-bold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                加入 🚀
              </motion.button>

              <button
                onClick={() => { setShowJoin(false); setJoinCode(""); setJoinError(null); }}
                className="mt-3 w-full cursor-pointer text-center text-sm text-gray-400 transition-colors hover:text-gray-600"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.35 }}
            onAnimationComplete={(def) => {
              if ((def as { opacity: number }).opacity === 1) {
                setTimeout(() => setToast(null), 2000);
              }
            }}
            className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-white/95 px-6 py-3 text-sm font-semibold text-orange-600 shadow-xl backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
