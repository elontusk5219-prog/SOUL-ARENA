import { createHash } from "node:crypto";

import { topicPresets } from "@/lib/arena-presets";
import type { TopicPreset } from "@/lib/arena-types";
import { zhihuFetchJson } from "@/lib/zhihu";

const hashTitle = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 10);

const normalizePresetTopic = (topic: TopicPreset): TopicPreset => ({
  ...topic,
  source: topic.source ?? "preset",
});

const deriveDynamicTopic = (
  headline: string,
  index: number,
): TopicPreset => {
  const trimmed = headline.trim();
  const stableId = `zhihu-${hashTitle(trimmed)}`;
  const prompt = `${trimmed} 这一热榜话题被放进 Soul Arena 后，双方应该如何围绕其核心矛盾展开对战？`;

  return {
    conLabel: "不应如此",
    fantasy: "热榜即战场",
    id: stableId,
    proLabel: "应当如此",
    prompt,
    source: "zhihu_dynamic",
    sourceMeta: {
      headline: trimmed,
      publishedInHours: 48,
      rankHint: index + 1,
    },
    stakes: `这场对战围绕「${trimmed}」背后的价值分歧、公共情绪和现实代价展开。`,
    title: `热榜辩题：${trimmed}`,
  };
};

export const getPresetTopics = () => topicPresets.map(normalizePresetTopic);

export const getDynamicZhihuTopics = async () => {
  try {
    const payload = await zhihuFetchJson<{
      data?: {
        list?: Array<{
          title?: string;
        }>;
      };
    }>("/openapi/billboard/list", {
      cacheTtlMs: 5 * 60 * 1000,
      query: {
        publish_in_hours: 48,
        top_cnt: 5,
      },
    });

    return (payload?.data?.list ?? [])
      .map((item) => item.title?.trim())
      .filter((item): item is string => Boolean(item))
      .map(deriveDynamicTopic);
  } catch {
    return [] as TopicPreset[];
  }
};

export const getArenaTopics = async () => {
  const [presetTopics, dynamicTopics] = await Promise.all([
    Promise.resolve(getPresetTopics()),
    getDynamicZhihuTopics(),
  ]);

  // Put zhihu dynamic topics first so they appear at top of selector
  return [...dynamicTopics, ...presetTopics];
};

export const resolveArenaTopic = async ({
  topicId,
  topicSnapshot,
}: {
  topicId: string;
  topicSnapshot?: TopicPreset;
}) => {
  if (topicSnapshot?.id === topicId) {
    return {
      ...topicSnapshot,
      source: topicSnapshot.source ?? "preset",
    };
  }

  const topics = await getArenaTopics();
  return topics.find((topic) => topic.id === topicId) ?? normalizePresetTopic(topicPresets[0]);
};
