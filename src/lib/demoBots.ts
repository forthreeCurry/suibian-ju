import { supabase } from "@/src/lib/supabase";

const STORAGE_KEY_PREFIX = "suibianju-demo-bots:";

/** MVP：自动补「演示成员」，方便单人开局测试；生产构建默认关闭，可用环境变量打开 */
export function isDemoBotSeedingEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_AUTO_DEMO_BOTS === "false") return false;
  if (process.env.NEXT_PUBLIC_AUTO_DEMO_BOTS === "true") return true;
  return process.env.NODE_ENV === "development";
}

/** 目标人数：至少 3 人可立刻点「锁定房间」（与 canStart ≥2 留余量） */
const TARGET_MEMBER_COUNT = 3;

const DEMO_BOTS = [
  { nickname: "🤖 饱饱", avatar_url: "🐷" },
  { nickname: "🤖 馋喵", avatar_url: "🐱" },
] as const;

function storageKey(roomId: string) {
  return `${STORAGE_KEY_PREFIX}${roomId}`;
}

/**
 * 按当前成员数补足演示机器人（最多插入 DEMO_BOTS 条）。
 * 成功后在 sessionStorage 打标，避免重复插入。
 */
export async function seedDemoMembersForRoom(
  roomId: string,
  currentMemberCount: number,
): Promise<void> {
  if (!isDemoBotSeedingEnabled()) return;
  if (typeof window !== "undefined" && sessionStorage.getItem(storageKey(roomId)))
    return;

  const need = Math.min(
    DEMO_BOTS.length,
    Math.max(0, TARGET_MEMBER_COUNT - currentMemberCount),
  );
  if (need <= 0) return;

  const rows = DEMO_BOTS.slice(0, need).map((b) => ({
    room_id: roomId,
    nickname: b.nickname,
    avatar_url: b.avatar_url,
  }));

  const { error } = await supabase.from("members").insert(rows);
  if (error) {
    console.error("seedDemoMembersForRoom:", error);
    return;
  }

  if (typeof window !== "undefined") {
    sessionStorage.setItem(storageKey(roomId), "1");
  }
}
