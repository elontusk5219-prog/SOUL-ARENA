import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { env } from "@/lib/env";
import { getActiveParticipantProvider, getArenaSessionId } from "@/lib/arena-session";
import {
  clearOpenClawBindCodesForSlot,
  clearOpenClawBindingsForSlot,
  getLatestOpenClawBindingForSlot,
  getOpenClawBindCode,
  getOpenClawBindingById,
  markOpenClawBindCodeUsed,
  saveOpenClawBindCode,
  saveOpenClawBinding,
} from "@/lib/arena-store";
import type {
  ArenaParticipantRef,
  ArenaParticipantSlot,
  ArenaParticipantSource,
  OpenClawBindCodeRecord,
  OpenClawBindingInput,
  OpenClawBindingRecord,
} from "@/lib/arena-types";

type OpenClawMoveRequest = {
  actionControl: string;
  message: string;
  systemPrompt?: string;
};

type OpenClawRegistrationInput = Omit<
  OpenClawBindingInput,
  "runtimeLabel" | "sourceKind"
> & {
  bindCode: string;
};

type SoulSectionKey =
  | "archetype"
  | "aura"
  | "declaration"
  | "display_name"
  | "memory_anchors"
  | "rule"
  | "soul_seed_tags"
  | "source_label"
  | "taboo"
  | "tags"
  | "viewpoints";

const defaultWorkspaceDir = join(homedir(), ".openclaw", "workspace");
const bindCodeTtlMs = 10 * 60 * 1000;
const defaultDeclaration =
  "I will enter the arena with the personality, rules, and memory anchors defined by this agent.";
const defaultRule =
  "Every claim must map back to the agent's declared boundaries, memory anchors, and observable outcomes.";
const defaultTaboo =
  "Do not contradict the declared persona, and do not fabricate unsupported experiences.";

const sectionAliases: Array<[SoulSectionKey, string[]]> = [
  ["display_name", ["name", "title", "displayname", "名称", "名字", "人格", "角色", "身份"]],
  ["archetype", ["archetype", "原型", "人格原型", "定位"]],
  ["aura", ["aura", "气场", "氛围"]],
  ["declaration", ["declaration", "宣言", "主张", "自述"]],
  ["rule", ["rule", "规则", "原则", "底线规则"]],
  ["taboo", ["taboo", "禁忌", "边界", "禁止", "不要做"]],
  ["viewpoints", ["viewpoints", "观点", "立场", "论点"]],
  ["tags", ["tags", "标签", "特征", "关键词"]],
  ["memory_anchors", ["memory", "记忆", "记忆锚点", "经历", "故事"]],
  ["soul_seed_tags", ["soulseedtags", "seedtags", "soulseed", "魂种", "魂核标签"]],
  ["source_label", ["sourcelabel", "来源", "来源标签"]],
];

const normalizeHeading = (value: string) =>
  value.toLowerCase().replace(/[`*_#:\-：\s]/g, "");

const stripBullet = (value: string) =>
  value
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^\s*\[[ xX]\]\s+/, "")
    .trim();

const toParagraphs = (value: string) =>
  value
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const toLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map(stripBullet)
    .filter(Boolean);

const toList = (value: string) => {
  const lines = toLines(value);

  if (lines.length > 1) {
    return lines;
  }

  const combined = lines[0] ?? value.trim();

  return combined
    .split(/[，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const firstText = (value: string) => toParagraphs(value)[0] ?? value.trim();

const normalizeBindingInput = (
  input: OpenClawBindingInput,
  defaults?: Partial<OpenClawBindingInput>,
): OpenClawBindingInput => {
  const displayName = input.displayName.trim() || defaults?.displayName || "OpenClaw Persona";
  const tags = input.tags.map((item) => item.trim()).filter(Boolean);
  const soulSeedTags = [...new Set([displayName, ...tags, ...input.soulSeedTags.map((item) => item.trim()).filter(Boolean)])].slice(0, 6);

  return {
    archetype: input.archetype?.trim() || defaults?.archetype,
    agentVersion: input.agentVersion?.trim() || defaults?.agentVersion,
    aura: input.aura?.trim() || defaults?.aura,
    avatarUrl: input.avatarUrl?.trim() || defaults?.avatarUrl,
    declaration: input.declaration.trim() || defaults?.declaration || defaultDeclaration,
    displayId: input.displayId?.trim() || defaults?.displayId,
    displayName,
    memoryAnchors: input.memoryAnchors.map((item) => item.trim()).filter(Boolean),
    rule: input.rule.trim() || defaults?.rule || defaultRule,
    runtimeLabel: input.runtimeLabel?.trim() || defaults?.runtimeLabel || "OpenClaw Skill Runtime",
    soulSeedTags,
    sourceFile: input.sourceFile?.trim() || defaults?.sourceFile,
    sourceKind: input.sourceKind ?? defaults?.sourceKind ?? "skill_push",
    sourceLabel: input.sourceLabel?.trim() || defaults?.sourceLabel || "Registered via OpenClaw Skill",
    taboo: input.taboo.trim() || defaults?.taboo || defaultTaboo,
    tags,
    viewpoints: input.viewpoints.map((item) => item.trim()).filter(Boolean).slice(0, 6),
  };
};

const parseFrontmatter = (markdown: string) => {
  if (!markdown.startsWith("---")) {
    return {
      body: markdown,
      frontmatter: {} as Record<string, string>,
    };
  }

  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return {
      body: markdown,
      frontmatter: {} as Record<string, string>,
    };
  }

  const frontmatter = match[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^([^:#]+):\s*(.+)$/))
    .filter((item): item is RegExpMatchArray => Boolean(item))
    .reduce<Record<string, string>>((accumulator, item) => {
      accumulator[item[1].trim()] = item[2].trim();
      return accumulator;
    }, {});

  return {
    body: markdown.slice(match[0].length),
    frontmatter,
  };
};

const getSectionKey = (heading: string): SoulSectionKey | null => {
  const normalized = normalizeHeading(heading);

  for (const [key, aliases] of sectionAliases) {
    if (aliases.some((alias) => normalized.includes(normalizeHeading(alias)))) {
      return key;
    }
  }

  return null;
};

const getOpenClawWorkspaceDir = () =>
  env.OPENCLAW_WORKSPACE_DIR ?? defaultWorkspaceDir;

export const getOpenClawSoulFilePath = () =>
  join(getOpenClawWorkspaceDir(), "soul.md");

export const readOpenClawSoulMarkdown = async () => {
  const sourceFile = getOpenClawSoulFilePath();

  try {
    const markdown = await readFile(sourceFile, "utf8");
    return {
      markdown,
      sourceFile,
    };
  } catch (error) {
    const suffix = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`OpenClaw persona file not found at ${sourceFile}${suffix}`);
  }
};

export const parseSoulMarkdownToBindingInput = ({
  markdown,
  sourceFile,
}: {
  markdown: string;
  sourceFile: string;
}): OpenClawBindingInput => {
  const { body, frontmatter } = parseFrontmatter(markdown);
  const sections = new Map<SoulSectionKey, string[]>();
  let title: string | null = null;
  let currentSection: SoulSectionKey | null = null;
  const introLines: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const headingText = headingMatch[2].trim();

      if (!title && headingMatch[1].length === 1) {
        title = headingText;
      }

      currentSection = getSectionKey(headingText);

      if (currentSection && !sections.has(currentSection)) {
        sections.set(currentSection, []);
      }

      continue;
    }

    if (currentSection) {
      sections.get(currentSection)?.push(line);
    } else {
      introLines.push(line);
    }
  }

  const getValue = (key: SoulSectionKey) =>
    sections.get(key)?.join("\n").trim() || frontmatter[key] || "";
  const declaration =
    firstText(getValue("declaration")) ||
    firstText(introLines.join("\n")) ||
    defaultDeclaration;
  const displayName =
    firstText(getValue("display_name")) ||
    frontmatter.name ||
    title ||
    "OpenClaw Persona";
  const rule = firstText(getValue("rule")) || defaultRule;
  const taboo = firstText(getValue("taboo")) || defaultTaboo;
  const viewpoints = toList(getValue("viewpoints"));
  const memoryAnchors = toList(getValue("memory_anchors"));
  const tags = toList(getValue("tags"));
  const soulSeedTags = toList(getValue("soul_seed_tags"));

  return normalizeBindingInput(
    {
      archetype: firstText(getValue("archetype")) || undefined,
      aura: firstText(getValue("aura")) || undefined,
      declaration,
      displayName,
      memoryAnchors,
      rule,
      runtimeLabel: "OpenClaw Hosted Runtime",
      soulSeedTags,
      sourceFile,
      sourceKind: "workspace_import",
      sourceLabel:
        firstText(getValue("source_label")) || "Imported from workspace/soul.md",
      taboo,
      tags,
      viewpoints: viewpoints.length ? viewpoints : [declaration, rule],
    },
    {
      sourceFile,
      sourceKind: "workspace_import",
      sourceLabel: "Imported from workspace/soul.md",
    },
  );
};

const toOpenClawParticipantSource = (
  binding: OpenClawBindingRecord | null,
  slot: ArenaParticipantSlot,
): ArenaParticipantSource => {
  if (!binding) {
    return {
      avatarUrl: null,
      connected: false,
      displayId: null,
      displayName: null,
      issues: [],
      participantId: undefined,
      provider: "openclaw",
      runtimeReady: Boolean(env.OPENCLAW_RUNTIME_BASE_URL),
      secondMeUserId: null,
      session: {
        authenticated: false,
        expiresAt: null,
      },
      shades: [],
      slot,
      softMemory: [],
      sourceLabel: "Registered via OpenClaw Skill",
      sourceMeta: {
        provider: "openclaw",
      },
      user: null,
    };
  }

  return {
    avatarUrl: binding.profile.avatarUrl ?? null,
    configVersion: binding.version,
    connected: true,
    displayId: binding.profile.displayId ?? null,
    displayName: binding.profile.displayName,
    issues: [],
    participantId: binding.id,
    provider: "openclaw",
    runtimeReady: Boolean(env.OPENCLAW_RUNTIME_BASE_URL),
    secondMeUserId: null,
    session: {
      authenticated: true,
      expiresAt: null,
    },
    shades: binding.profile.tags.map((tag, index) => ({
      id: `${binding.id}:tag:${index}`,
      label: tag,
    })),
    slot,
    softMemory: binding.profile.memoryAnchors.map((memory, index) => ({
      id: `${binding.id}:memory:${index}`,
      summary: memory,
    })),
    sourceLabel: binding.profile.sourceLabel,
    sourceMeta: {
      agentVersion: binding.profile.agentVersion ?? null,
      archetype: binding.profile.archetype,
      aura: binding.profile.aura,
      provider: "openclaw",
      runtimeLabel: binding.profile.runtimeLabel,
      sourceFile: binding.profile.sourceFile ?? getOpenClawSoulFilePath(),
      sourceKind: binding.profile.sourceKind,
      version: binding.version,
      viewpoints: binding.profile.viewpoints,
    },
    user: {
      arenaArchetype: binding.profile.archetype,
      arenaAura: binding.profile.aura,
      arenaDeclaration: binding.profile.declaration,
      arenaRule: binding.profile.rule,
      arenaSoulSeedTags: binding.profile.soulSeedTags,
      arenaTaboo: binding.profile.taboo,
      arenaViewpoints: binding.profile.viewpoints,
      avatarUrl: binding.profile.avatarUrl,
      bio: binding.profile.declaration,
      displayId: binding.profile.displayId,
      openclawAgentVersion: binding.profile.agentVersion,
      openclawSourceFile:
        binding.profile.sourceFile ?? getOpenClawSoulFilePath(),
      route: binding.profile.displayId
        ? `openclaw/${binding.profile.displayId}`
        : `openclaw/${binding.profile.displayName}`,
      runtimeLabel: binding.profile.runtimeLabel,
      sourceKind: binding.profile.sourceKind,
      sourceLabel: binding.profile.sourceLabel,
      version: binding.version,
    },
  };
};

const createBindCodeValue = () =>
  randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

export const createOpenClawBindCodeForSlot = async (
  slot: ArenaParticipantSlot,
) => {
  const sessionId = await getArenaSessionId();
  clearOpenClawBindCodesForSlot({
    sessionId,
    slot,
  });

  return saveOpenClawBindCode({
    code: createBindCodeValue(),
    expiresAt: new Date(Date.now() + bindCodeTtlMs).toISOString(),
    sessionId,
    slot,
  });
};

const assertBindCodeUsable = (record: OpenClawBindCodeRecord | null) => {
  if (!record) {
    throw new Error("Invalid bind code");
  }

  if (record.usedAt) {
    throw new Error("Bind code has already been used");
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new Error("Bind code has expired");
  }

  return record;
};

export const registerOpenClawBindingWithCode = async (
  input: OpenClawRegistrationInput,
) => {
  const bindCode = assertBindCodeUsable(getOpenClawBindCode(input.bindCode));
  const binding = saveOpenClawBinding({
    input: normalizeBindingInput(
      {
        archetype: input.archetype,
        agentVersion: input.agentVersion,
        aura: input.aura,
        avatarUrl: input.avatarUrl,
        declaration: input.declaration,
        displayId: input.displayId,
        displayName: input.displayName,
        memoryAnchors: input.memoryAnchors,
        rule: input.rule,
        runtimeLabel: "OpenClaw Skill Runtime",
        soulSeedTags: input.soulSeedTags,
        sourceLabel: input.sourceLabel || "Registered via OpenClaw Skill",
        taboo: input.taboo,
        tags: input.tags,
        viewpoints: input.viewpoints,
      },
      {
        runtimeLabel: "OpenClaw Skill Runtime",
        sourceKind: "skill_push",
        sourceLabel: "Registered via OpenClaw Skill",
      },
    ),
    sessionId: bindCode.sessionId,
    slot: bindCode.slot,
  });

  markOpenClawBindCodeUsed({
    code: bindCode.code,
    usedAt: new Date().toISOString(),
  });

  return {
    bindCode,
    binding,
    participant: toOpenClawParticipantSource(binding, bindCode.slot),
  };
};

export const importOpenClawSoulForSlot = async (slot: ArenaParticipantSlot) => {
  const { markdown, sourceFile } = await readOpenClawSoulMarkdown();
  const input = parseSoulMarkdownToBindingInput({
    markdown,
    sourceFile,
  });
  const sessionId = await getArenaSessionId();

  return saveOpenClawBinding({
    input,
    sessionId,
    slot,
  });
};

export const getOpenClawBindingForSlot = async ({
  bindingId,
  slot,
}: {
  bindingId?: string;
  slot: ArenaParticipantSlot;
}) => {
  const sessionId = await getArenaSessionId();

  if (bindingId) {
    return getOpenClawBindingById({
      bindingId,
      sessionId,
    });
  }

  return getLatestOpenClawBindingForSlot({
    sessionId,
    slot,
  });
};

export const clearOpenClawBindingForSlot = async (slot: ArenaParticipantSlot) => {
  const sessionId = await getArenaSessionId();
  clearOpenClawBindingsForSlot({
    sessionId,
    slot,
  });
  clearOpenClawBindCodesForSlot({
    sessionId,
    slot,
  });
};

export const getOpenClawParticipantSource = async (
  ref: Pick<ArenaParticipantRef, "participantId" | "slot">,
) => {
  const binding = await getOpenClawBindingForSlot({
    bindingId: ref.participantId,
    slot: ref.slot,
  });

  return toOpenClawParticipantSource(binding, ref.slot);
};

export const getCurrentOpenClawParticipantSource = async (
  slot: ArenaParticipantSlot,
) => {
  const activeProvider = await getActiveParticipantProvider(slot);

  if (activeProvider !== "openclaw") {
    return null;
  }

  return getOpenClawParticipantSource({ slot });
};

export const requestOpenClawAction = async <T>(
  binding: OpenClawBindingRecord | null,
  payload: OpenClawMoveRequest,
) => {
  if (!binding || !env.OPENCLAW_RUNTIME_BASE_URL) {
    return null;
  }

  const response = await fetch(
    `${env.OPENCLAW_RUNTIME_BASE_URL.replace(/\/$/, "")}/arena/act`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.OPENCLAW_RUNTIME_TOKEN
          ? {
              Authorization: `Bearer ${env.OPENCLAW_RUNTIME_TOKEN}`,
            }
          : {}),
      },
      body: JSON.stringify({
        actionControl: payload.actionControl,
        binding,
        message: payload.message,
        systemPrompt: payload.systemPrompt,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(env.OPENCLAW_RUNTIME_TIMEOUT_MS),
    },
  ).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  return (await response.json()) as T;
};
