"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient, type RestaurantItem } from "@/src/lib/api-client";

const PRICE_LABELS: Record<string, string> = { low: "平价", mid: "适中", high: "高端" };
const PRICE_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  mid: "bg-blue-100 text-blue-700",
  high: "bg-purple-100 text-purple-700",
};

const CUISINE_OPTIONS = [
  "火锅", "川菜", "粤菜", "湘菜", "东北菜", "江浙菜", "新疆菜",
  "日料", "韩餐", "西餐", "烧烤", "小吃快餐", "面馆", "自助餐",
];

export default function RestaurantList() {
  const [items, setItems] = useState<RestaurantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [cuisine, setCuisine] = useState("");
  const [priceLevel, setPriceLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 12;

  const fetchData = useCallback(async (p: number, c: string) => {
    setLoading(true);
    setError(null);
    const res = await apiClient.listRestaurants({ page: p, page_size: PAGE_SIZE, cuisine: c || undefined });
    if (res.success) {
      let filtered = res.data.items;
      if (priceLevel) {
        filtered = filtered.filter((r) => r.price_level === priceLevel);
      }
      setItems(filtered);
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [priceLevel]);

  useEffect(() => {
    fetchData(page, cuisine);
  }, [page, cuisine, fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="w-full max-w-sm">
      {/* header */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-800">附近热门餐厅</h3>
        <p className="mt-1 text-sm text-gray-400">共 {total} 家 · 来自高德地图</p>
      </div>

      {/* filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={cuisine}
          onChange={(e) => { setCuisine(e.target.value); setPage(1); }}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-orange-400"
        >
          <option value="">全部菜系</option>
          {CUISINE_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={priceLevel}
          onChange={(e) => setPriceLevel(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-orange-400"
        >
          <option value="">全部价位</option>
          <option value="low">平价</option>
          <option value="mid">适中</option>
          <option value="high">高端</option>
        </select>
      </div>

      {/* error */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {/* loading */}
      {loading && (
        <div className="flex flex-col items-center gap-2 py-12">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="text-2xl"
          >
            🍜
          </motion.span>
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      )}

      {/* empty */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 text-sm text-gray-400">暂无餐厅数据</p>
          <p className="mt-1 text-xs text-gray-300">请先执行数据同步</p>
        </div>
      )}

      {/* list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${page}-${cuisine}-${priceLevel}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col gap-3"
        >
          {items.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* cover */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 text-3xl">
                {r.cover_image ? (
                  <img src={r.cover_image} alt={r.name} className="h-full w-full rounded-xl object-cover" />
                ) : (
                  "🍽️"
                )}
              </div>

              {/* info */}
              <div className="flex flex-1 flex-col justify-between overflow-hidden">
                <div>
                  <h4 className="truncate text-base font-bold text-gray-800">{r.name}</h4>
                  <p className="truncate text-xs text-gray-400">{r.address || "地址待更新"}</p>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  {/* rating */}
                  {r.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                      ⭐ {Number(r.rating).toFixed(1)}
                    </span>
                  )}
                  {/* price */}
                  {r.avg_price > 0 && (
                    <span className="text-xs text-gray-500">¥{r.avg_price}/人</span>
                  )}
                  {/* price level tag */}
                  {r.price_level && PRICE_LABELS[r.price_level] && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRICE_COLORS[r.price_level] || "bg-gray-100 text-gray-600"}`}>
                      {PRICE_LABELS[r.price_level]}
                    </span>
                  )}
                </div>

                {/* tags */}
                {r.tags && (Array.isArray(r.tags) ? r.tags : []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(Array.isArray(r.tags) ? r.tags : []).slice(0, 4).map((t: string) => (
                      <span key={t} className="rounded-md bg-orange-50 px-1.5 py-0.5 text-xs text-orange-600">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* pagination */}
      {totalPages > 1 && !loading && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← 上一页
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            下一页 →
          </button>
        </div>
      )}

      {/* footer */}
      <p className="mt-6 text-center text-xs text-gray-300">数据来源：高德地图 · 每日更新</p>
    </div>
  );
}
