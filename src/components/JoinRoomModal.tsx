"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/src/lib/supabase";

const AVATARS = [
  "🐱", "🐶", "🐼", "🦊", "🐸", "🐯", "🐷", "🐵",
  "🐰", "🦁", "🐻", "🐨", "🐮", "🐔", "🐙", "🦄",
];

interface JoinRoomModalProps {
  roomId: string;
  roomName?: string | null;
  roomStatus?: string;
  maxMembers?: number;
  currentCount?: number;
  onSuccess: (memberId: string) => void;
}

export default function JoinRoomModal({
  roomId,
  roomName,
  roomStatus = "waiting",
  maxMembers = 10,
  currentCount = 0,
  onSuccess,
}: JoinRoomModalProps) {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFull = currentCount >= maxMembers;
  const isStarted = roomStatus !== "waiting";
  const blocked = isFull || isStarted;

  useEffect(() => {
    if (!blocked) setTimeout(() => inputRef.current?.focus(), 100);
  }, [blocked]);

  const handleJoin = useCallback(async () => {
    const name = nickname.trim();
    if (!name || loading || blocked) return;

    setLoading(true);
    setError(null);

    try {
      const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

      const { data: member, error: err } = await supabase
        .from("members")
        .insert({ room_id: roomId, nickname: name, avatar_url: avatar })
        .select("id")
        .single();

      if (err || !member) throw err ?? new Error("加入失败");

      localStorage.setItem("memberId", member.id);
      localStorage.setItem("roomId", roomId);

      onSuccess(member.id);
    } catch (e) {
      console.error(e);
      setError("加入失败，请重试");
      setLoading(false);
    }
  }, [nickname, loading, roomId, blocked, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-gray-800">
          朋友喊你来聚餐啦！
        </h2>

        {roomName && (
          <p className="mt-1 text-base font-semibold text-orange-500">
            「{roomName}」
          </p>
        )}

        <p className="mt-1 text-sm text-gray-400">
          {blocked
            ? isFull
              ? `房间已满（${currentCount}/${maxMembers} 人）`
              : "聚餐已开始，无法加入"
            : `已有 ${currentCount} 人加入 · 取个昵称，马上开吃`}
        </p>

        {blocked ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <span className="text-4xl">{isFull ? "🈵" : "🚫"}</span>
            <p className="text-center text-sm font-medium text-gray-500">
              {isFull
                ? "人数已达上限，换个局吧"
                : "聚餐已开始，下次早点来"}
            </p>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
              placeholder="你的干饭昵称"
              maxLength={8}
              disabled={loading}
              className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-800 outline-none placeholder:text-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
            />

            {error && (
              <p className="mt-2 text-center text-sm text-red-500">{error}</p>
            )}

            <motion.button
              whileTap={loading ? undefined : { scale: 0.96 }}
              onClick={handleJoin}
              disabled={loading || !nickname.trim()}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 py-3.5 text-base font-bold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
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
                  加入中...
                </>
              ) : (
                "🚀 冲！加入房间"
              )}
            </motion.button>
          </>
        )}
      </motion.div>
    </div>
  );
}
