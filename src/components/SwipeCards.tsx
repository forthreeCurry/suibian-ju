"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Card {
  title: string;
  emoji: string;
  image: string;
}

const CARDS: Card[] = [
  {
    title: "无辣不欢",
    emoji: "🌶️",
    image: "https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "清淡养生",
    emoji: "🥗",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "大口吃肉",
    emoji: "🥩",
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "碳水狂魔",
    emoji: "🍜",
    image:
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "海鲜盛宴",
    emoji: "🦞",
    // 生蚝+柠檬+冰盘特写（Pexels #5038910 / leeloothefirst，避免海边餐厅远景）
    image:
      "https://images.pexels.com/photos/5038910/pexels-photo-5038910.jpeg?auto=compress&cs=tinysrgb&w=400&h=600&fit=crop",
  },
  {
    title: "精致日料",
    emoji: "🍣",
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "高颜值出片",
    emoji: "📸",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=600&fit=crop&auto=format",
  },
  {
    title: "地摊烟火气",
    emoji: "🔥",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=600&fit=crop&auto=format",
  },
];

export interface TasteRatings {
  likes: string[];
  neutrals: string[];
  dislikes: string[];
}

interface SwipeCardsProps {
  onComplete?: (result: TasteRatings) => void;
}

type Rating = "dislike" | "neutral" | "like";

const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

function BackgroundCard({ card, depth }: { card: Card; depth: number }) {
  return (
    <motion.div
      initial={false}
      animate={{ scale: 1 - depth * 0.05, y: depth * 12 }}
      transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.85 }}
      className="absolute inset-0 overflow-hidden rounded-3xl shadow-[0_6px_25px_rgba(0,0,0,0.15)]"
      style={{ zIndex: 5 - depth }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt={card.title}
        className="pointer-events-none h-full w-full object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 pb-24">
        <span className="text-4xl">{card.emoji}</span>
        <h3 className="text-2xl font-extrabold text-white drop-shadow-lg">
          {card.title}
        </h3>
      </div>
    </motion.div>
  );
}

export default function SwipeCards({ onComplete }: SwipeCardsProps) {
  const [index, setIndex] = useState(0);
  const [likes, setLikes] = useState<string[]>([]);
  const [neutrals, setNeutrals] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const pendingResultRef = useRef<TasteRatings | null>(null);

  useEffect(() => {
    const preload = (src: string) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    };
    for (let k = index; k < Math.min(index + 4, CARDS.length); k += 1) {
      preload(CARDS[k].image);
    }
  }, [index]);

  const handleRate = useCallback(
    (rating: Rating) => {
      const title = CARDS[index].title;
      const nextLikes = rating === "like" ? [...likes, title] : likes;
      const nextNeutrals = rating === "neutral" ? [...neutrals, title] : neutrals;
      const nextDislikes = rating === "dislike" ? [...dislikes, title] : dislikes;

      setLikes(nextLikes);
      setNeutrals(nextNeutrals);
      setDislikes(nextDislikes);

      const isLast = index + 1 >= CARDS.length;
      if (isLast) {
        pendingResultRef.current = {
          likes: nextLikes,
          neutrals: nextNeutrals,
          dislikes: nextDislikes,
        };
      }
      setIndex((i) => i + 1);
    },
    [index, likes, neutrals, dislikes],
  );

  const handleExitComplete = useCallback(() => {
    if (!pendingResultRef.current) return;
    const payload = pendingResultRef.current;
    pendingResultRef.current = null;
    setFinished(true);
    onComplete?.(payload);
  }, [onComplete]);

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="text-5xl">🎉</span>
        <h2 className="text-2xl font-bold text-white drop-shadow">
          已完成口味测试
        </h2>
        <div className="max-w-xs space-y-1 text-sm text-white/75">
          {likes.length > 0 && (
            <p>
              <span className="font-semibold text-white">想吃：</span>
              {likes.join("、")}
            </p>
          )}
          {neutrals.length > 0 && (
            <p>
              <span className="font-semibold text-white">能接受：</span>
              {neutrals.join("、")}
            </p>
          )}
          {dislikes.length > 0 && (
            <p>
              <span className="font-semibold text-white">不想吃：</span>
              {dislikes.join("、")}
            </p>
          )}
        </div>
      </div>
    );
  }

  const current = CARDS[index];
  const behind = CARDS.slice(index + 1, index + 3);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 280, height: 400 }}>
        {behind
          .slice()
          .reverse()
          .map((card, reverseIdx) => {
            const depth = behind.length - reverseIdx;
            return <BackgroundCard key={card.title} card={card} depth={depth} />;
          })}

        <AnimatePresence mode="sync" onExitComplete={handleExitComplete}>
          {current && (
            <motion.div
              key={current.title}
              initial={{ y: 32, opacity: 0.9, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{
                y: "-108%",
                opacity: 0,
                scale: 0.94,
                rotate: -1.5,
                transition: { duration: 0.36, ease: easeOutExpo },
              }}
              transition={{ type: "spring", stiffness: 440, damping: 32, mass: 0.78 }}
              className="absolute inset-0 z-10 overflow-hidden rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.25)] will-change-transform"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.image}
                alt={current.title}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

              <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[1] flex flex-col gap-1 px-6">
                <span className="text-4xl">{current.emoji}</span>
                <h3 className="text-2xl font-extrabold text-white drop-shadow-lg">
                  {current.title}
                </h3>
              </div>

              {/* three rating buttons */}
              <div className="absolute inset-x-0 bottom-0 z-[2] flex gap-1.5 border-t border-white/10 bg-black/35 px-2 py-3 backdrop-blur-sm">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleRate("dislike")}
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-white/15 py-2 text-[10px] font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-red-500/40"
                >
                  <span className="text-lg leading-none">😫</span>
                  <span>不想吃</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleRate("neutral")}
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-white/15 py-2 text-[10px] font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-amber-500/40"
                >
                  <span className="text-lg leading-none">😐</span>
                  <span>能接受</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleRate("like")}
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-white/15 py-2 text-[10px] font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-emerald-500/40"
                >
                  <span className="text-lg leading-none">🤤</span>
                  <span>想吃！</span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* progress */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <div className="flex w-56 justify-between text-[10px] font-medium text-white/55">
          <span>😫 不想吃</span>
          <span>😐 能接受</span>
          <span>🤤 想吃</span>
        </div>
        <p className="text-sm font-semibold text-white/80">
          {Math.min(index + 1, CARDS.length)} / {CARDS.length}
        </p>
        <div className="flex h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <motion.div
            className="h-full rounded-full bg-orange-400"
            initial={false}
            animate={{
              width: `${(Math.min(index + 1, CARDS.length) / CARDS.length) * 100}%`,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          />
        </div>
      </div>
    </div>
  );
}
