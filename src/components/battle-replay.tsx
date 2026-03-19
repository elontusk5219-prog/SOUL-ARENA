"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { soulLabels } from "@/lib/arena-presets";
import type {
  ArenaBattleCompetitionSide,
  ArenaCompetitorProfile,
  ArenaParticipantSnapshot,
  BuildCard,
  BattleEvent,
  BattlePackage,
  SoulStatKey,
  SoulStats,
} from "@/lib/arena-types";

const battleStorageKey = (battleId: string) => `soul-arena:battle:${battleId}`;

type ReplayState = {
  currentEvent: BattleEvent | null;
  defenderHealth: number;
  defenderScore: number;
  playerHealth: number;
  playerScore: number;
  round: number;
};

type ProfileResponse = {
  profiles: Array<{
    competitorId: string;
    profile: ArenaCompetitorProfile | null;
  }>;
};

type RematchResponse = {
  setup: {
    id: string;
  };
};

const formatSoul = (soul: SoulStats) =>
  (Object.keys(soulLabels) as Array<keyof SoulStats>).map((key) => ({
    key,
    label: soulLabels[key],
    value: soul[key],
  }));

const deriveReplayState = (battle: BattlePackage, playhead: number): ReplayState => {
  let playerHealth = 100;
  let defenderHealth = 100;
  let playerScore = 0;
  let defenderScore = 0;
  let round = 0;

  for (const event of battle.events.slice(0, playhead + 1)) {
    round = Math.max(round, event.round);

    if (typeof event.effect?.scoreDelta === "number" && event.actorId) {
      if (event.actorId === battle.player.id) {
        playerScore += event.effect.scoreDelta;
      }
      if (event.actorId === battle.defender.id) {
        defenderScore += event.effect.scoreDelta;
      }
    }

    if (typeof event.effect?.healthDelta === "number" && event.targetId) {
      if (event.targetId === battle.player.id) {
        playerHealth = Math.max(0, playerHealth + event.effect.healthDelta);
      }
      if (event.targetId === battle.defender.id) {
        defenderHealth = Math.max(0, defenderHealth + event.effect.healthDelta);
      }
    }
  }

  return {
    currentEvent: battle.events[playhead] ?? null,
    defenderHealth,
    defenderScore,
    playerHealth,
    playerScore,
    round,
  };
};

type AudienceMemberCanvas = {
  id: string;
  displayName: string;
  avatarDataUrl: string | null;
  seatX: number;
  seatRow: number;
  bobPhase: number;
};

type AnnouncerState = {
  text: string;
  color: string;
  scale: number;
  alpha: number;
};

function drawStage(
  canvas: HTMLCanvasElement,
  battle: BattlePackage,
  replayState: ReplayState,
  playerAvatar: HTMLImageElement | null,
  defenderAvatar: HTMLImageElement | null,
  playerSprite: HTMLImageElement | null,
  defenderSprite: HTMLImageElement | null,
  animTime: number,
  poseAge: number,
  audienceMembers: AudienceMemberCanvas[],
  avatarImageCache: Map<string, HTMLImageElement>,
  arenaBg: HTMLImageElement | null,
  arenaFloor: HTMLImageElement | null,
  announcer: AnnouncerState | null,
  phase: "playing" | "complete",
  winnerName: string,
  winnerCrown: HTMLImageElement | null,
  koExplosion: HTMLImageElement | null,
  hitEffect: HTMLImageElement | null,
  energyOrb: HTMLImageElement | null,
  fightText: HTMLImageElement | null,
  roundBanner: HTMLImageElement | null,
  koText: HTMLImageElement | null,
  victoryText: HTMLImageElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const { currentEvent } = replayState;
  const evType = currentEvent?.type ?? "";
  const actorIsPlayer = currentEvent?.actorId === battle.player.id;
  const targetIsPlayer = currentEvent?.targetId === battle.player.id;
  const targetIsDefender = currentEvent?.targetId === battle.defender.id;

  // ── 1. ARENA BACKGROUND ────────────────────────────────────────
  if (arenaBg) {
    // Draw AI-generated arena background image
    ctx.drawImage(arenaBg, 0, 0, W, H);
    // Dark overlay to ensure consistent contrast for game elements
    const overlay = ctx.createLinearGradient(0, 0, 0, H);
    overlay.addColorStop(0, "rgba(0,0,0,0.45)");
    overlay.addColorStop(0.4, "rgba(0,0,0,0.25)");
    overlay.addColorStop(0.75, "rgba(0,0,0,0.35)");
    overlay.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Fallback gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#06000e");
    bg.addColorStop(0.55, "#10000a");
    bg.addColorStop(1, "#180004");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Back wall
    const wallGrad = ctx.createLinearGradient(0, 90, 0, 500);
    wallGrad.addColorStop(0, "#1c0007");
    wallGrad.addColorStop(1, "#0a0002");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 90, W, 430);
  }

  // Wall horizontal lines (stone texture — subtle on top of arenaBg)
  if (!arenaBg) {
    for (let y = 105; y < 500; y += 26) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, y, W, 1);
    }
  }

  // Pillars (4) — drawn on top of arenaBg for atmospheric depth
  for (const px of [70, 230, W - 230, W - 70]) {
    const pg = ctx.createLinearGradient(px - 22, 0, px + 22, 0);
    pg.addColorStop(0, "#0a0002");
    pg.addColorStop(0.35, "#280009");
    pg.addColorStop(0.65, "#1c0006");
    pg.addColorStop(1, "#060001");
    ctx.fillStyle = pg;
    ctx.fillRect(px - 22, 90, 44, 430);
    // Pillar inner glow line
    ctx.fillStyle = "rgba(180,0,0,0.12)";
    ctx.fillRect(px - 2, 90, 4, 430);
    // Torch at top
    const tg = ctx.createRadialGradient(px, 115, 2, px, 115, 38);
    tg.addColorStop(0, "rgba(255,110,0,0.85)");
    tg.addColorStop(0.45, "rgba(200,20,0,0.3)");
    tg.addColorStop(1, "transparent");
    ctx.fillStyle = tg;
    ctx.fillRect(px - 38, 77, 76, 76);
    // Flame
    ctx.beginPath();
    ctx.moveTo(px - 7, 125);
    ctx.quadraticCurveTo(px - 12, 102, px, 90);
    ctx.quadraticCurveTo(px + 12, 102, px + 7, 125);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,140,0,0.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 4, 120);
    ctx.quadraticCurveTo(px, 104, px + 4, 120);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,230,100,0.85)";
    ctx.fill();
  }

  // Crowd silhouettes (only when no AI arena background — the bg already has crowds)
  if (!arenaBg) {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    for (let i = 0; i < 58; i++) {
      const cx2 = 18 + i * 22 + (i % 3) * 3;
      const cy2 = 380 + Math.sin(i * 0.7) * 7;
      const r2 = 8 + Math.sin(i * 1.2) * 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx2 - 5, cy2 + r2, 10, 15);
    }
    for (let i = 0; i < 54; i++) {
      const cx2 = 28 + i * 23;
      const cy2 = 403 + Math.sin(i * 0.9) * 5;
      const r2 = 7 + Math.sin(i * 1.5) * 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx2 - 4, cy2 + r2, 8, 13);
    }
  }

  // Floor
  const floorY = 555;
  if (arenaFloor) {
    // Use AI-generated floor texture with perspective
    ctx.save();
    // Draw tiled floor texture with perspective transform
    const pat = ctx.createPattern(arenaFloor, "repeat");
    if (pat) {
      pat.setTransform(new DOMMatrix([0.7, 0, 0, 0.4, 0, 0]));
      ctx.fillStyle = pat;
    } else {
      const floorGrad2 = ctx.createLinearGradient(0, floorY, 0, H);
      floorGrad2.addColorStop(0, "#180004");
      floorGrad2.addColorStop(1, "#050001");
      ctx.fillStyle = floorGrad2;
    }
    ctx.fillRect(0, floorY, W, H - floorY);
    // Dark overlay to blend floor into scene
    const floorDark = ctx.createLinearGradient(0, floorY, 0, H);
    floorDark.addColorStop(0, "rgba(0,0,0,0.45)");
    floorDark.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = floorDark;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.restore();
  } else {
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
    floorGrad.addColorStop(0, "#180004");
    floorGrad.addColorStop(0.25, "#0c0002");
    floorGrad.addColorStop(1, "#050001");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, W, H - floorY);
  }
  // Enhanced floor edge glow — pulsing red energy line
  const glowPulse = 0.15 + 0.08 * Math.sin(animTime * 0.003);
  const floorEdge = ctx.createLinearGradient(0, floorY - 10, 0, floorY + 80);
  floorEdge.addColorStop(0, `rgba(255,60,0,${glowPulse * 1.2})`);
  floorEdge.addColorStop(0.15, `rgba(200,0,0,${glowPulse})`);
  floorEdge.addColorStop(1, "transparent");
  ctx.fillStyle = floorEdge;
  ctx.fillRect(0, floorY - 10, W, 90);
  // Bright floor edge line
  const lineAlpha = 0.55 + 0.25 * Math.sin(animTime * 0.003);
  ctx.fillStyle = `rgba(220,30,0,${lineAlpha})`;
  ctx.fillRect(0, floorY, W, 2);
  // Perspective floor lines
  ctx.save();
  ctx.strokeStyle = "rgba(200,30,0,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(W / 2, H + 120); ctx.stroke();
  }
  // Horizontal floor grid lines
  for (let fy = floorY + 20; fy < H; fy += 30) {
    const alpha = 0.08 * (1 - (fy - floorY) / (H - floorY));
    ctx.strokeStyle = `rgba(180,0,0,${alpha})`;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
  }
  ctx.restore();

  // ── AUDIENCE SECTION ────────────────────────────────────────────
  // Subtle audience glow gradient at the bottom
  const audienceGlow = ctx.createLinearGradient(0, floorY + 8, 0, H);
  audienceGlow.addColorStop(0, "rgba(80,0,0,0.22)");
  audienceGlow.addColorStop(1, "transparent");
  ctx.fillStyle = audienceGlow;
  ctx.fillRect(0, floorY + 8, W, H - floorY - 8);

  // Row configs: front row is most visible
  const rowConfigs = [
    { yOffset: 18, opacity: 1.0 },
    { yOffset: 38, opacity: 0.85 },
    { yOffset: 56, opacity: 0.7 },
  ];

  for (const member of audienceMembers) {
    const row = rowConfigs[member.seatRow];
    if (!row) continue;
    const bobY = Math.sin(animTime * 0.002 + member.bobPhase) * 2;
    const mx = member.seatX;
    const my = floorY + row.yOffset + bobY;
    const r = 11;

    ctx.save();
    ctx.globalAlpha = row.opacity;
    const cachedImg = avatarImageCache.get(member.id);
    if (cachedImg) {
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(cachedImg, mx - r, my - r, r * 2, r * 2);
    } else {
      // Colored circle with initial letter
      const hue = (member.displayName.charCodeAt(0) * 37) % 360;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue},60%,28%)`;
      ctx.fill();
      ctx.font = `700 ${r}px Impact, Arial Black, sans-serif`;
      ctx.fillStyle = `hsl(${hue},80%,75%)`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(member.displayName.charAt(0).toUpperCase(), mx, my);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }

  // Scanlines (CRT effect)
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(0, y, W, 2);
  }

  // ── DRAMATIC VIGNETTE OVERLAY ───────────────────────────────────
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.9);
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(0.6, "rgba(0,0,0,0.1)");
  vignette.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Side red vignette edges
  const leftVig = ctx.createLinearGradient(0, 0, 120, 0);
  leftVig.addColorStop(0, "rgba(80,0,0,0.28)");
  leftVig.addColorStop(1, "transparent");
  ctx.fillStyle = leftVig;
  ctx.fillRect(0, 0, 120, H);
  const rightVig = ctx.createLinearGradient(W - 120, 0, W, 0);
  rightVig.addColorStop(0, "transparent");
  rightVig.addColorStop(1, "rgba(80,0,0,0.28)");
  ctx.fillStyle = rightVig;
  ctx.fillRect(W - 120, 0, 120, H);

  // ── 2. HUD BAR ─────────────────────────────────────────────────
  const hudH = 90;
  // HUD background with subtle gradient
  const hudBg = ctx.createLinearGradient(0, 0, 0, hudH);
  hudBg.addColorStop(0, "rgba(0,0,0,0.95)");
  hudBg.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = hudBg;
  ctx.fillRect(0, 0, W, hudH);
  // HUD top edge — gold accent line
  ctx.fillStyle = "rgba(212,160,0,0.5)";
  ctx.fillRect(0, 0, W, 1);
  // HUD bottom edge — red glow line
  const hudBottom = ctx.createLinearGradient(0, hudH - 3, 0, hudH + 6);
  hudBottom.addColorStop(0, "rgba(200,0,0,0.75)");
  hudBottom.addColorStop(1, "rgba(200,0,0,0)");
  ctx.fillStyle = hudBottom;
  ctx.fillRect(0, hudH - 3, W, 9);
  ctx.fillStyle = "rgba(255,30,0,0.9)";
  ctx.fillRect(0, hudH - 2, W, 2);

  // VS center divider
  ctx.textAlign = "center";
  ctx.font = "700 24px Impact, Arial Black, sans-serif";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "rgba(255,200,0,0.9)";
  ctx.shadowBlur = 18;
  ctx.fillText("VS", W / 2, 30);
  ctx.shadowBlur = 0;

  // ROUND label below VS
  ctx.font = "700 11px Impact, Arial Black, sans-serif";
  ctx.fillStyle = "#ff2200";
  ctx.shadowColor = "rgba(255,30,0,0.7)";
  ctx.shadowBlur = 6;
  ctx.fillText(`ROUND ${Math.max(1, replayState.round)}`, W / 2, 46);
  ctx.shadowBlur = 0;
  ctx.font = "500 9px 'Courier New', monospace";
  ctx.fillStyle = "rgba(232,212,184,0.45)";
  ctx.fillText(battle.topic.title, W / 2, 60);

  // Player name (left side)
  ctx.font = "bold 17px Impact, Arial Black, sans-serif";
  ctx.fillStyle = "#ff3300";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(255,40,0,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillText(battle.player.displayName.toUpperCase(), 18, 22);
  ctx.shadowBlur = 0;
  // Defender name (right side)
  ctx.font = "bold 17px Impact, Arial Black, sans-serif";
  ctx.fillStyle = "#ffd700";
  ctx.textAlign = "right";
  ctx.shadowColor = "rgba(255,215,0,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillText(battle.defender.displayName.toUpperCase(), W - 18, 22);
  ctx.shadowBlur = 0;

  // Health bars — enhanced with dramatic glow and borders
  const barPad = 18;
  const barW2 = W / 2 - 120;
  const barY2 = 64;
  const barH2 = 22;
  // ── Player health bar (left→right) ──
  // Outer border/shadow
  ctx.fillStyle = "rgba(255,30,0,0.25)"; ctx.fillRect(barPad - 2, barY2 - 2, barW2 + 4, barH2 + 4);
  // Track background
  ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.fillRect(barPad, barY2, barW2, barH2);
  const pFill = (barW2 * replayState.playerHealth) / 100;
  // Fill gradient
  const pBarGrad = ctx.createLinearGradient(barPad, 0, barPad + barW2, 0);
  pBarGrad.addColorStop(0, "#6b0000"); pBarGrad.addColorStop(0.5, "#cc0000"); pBarGrad.addColorStop(1, "#ff4400");
  ctx.fillStyle = pBarGrad; ctx.fillRect(barPad, barY2, pFill, barH2);
  // Shine highlight
  ctx.fillStyle = "rgba(255,200,200,0.18)"; ctx.fillRect(barPad, barY2, pFill, 6);
  // Glow below the bar
  if (pFill > 0) {
    ctx.shadowColor = "rgba(255,30,0,0.7)"; ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,30,0,0.0)"; ctx.fillRect(barPad, barY2 + barH2 - 1, pFill, 1);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = "left"; ctx.font = "bold 10px Impact, Arial Black, sans-serif";
  ctx.fillStyle = replayState.playerHealth > 25 ? "rgba(255,220,220,0.85)" : "#ff6600";
  ctx.fillText(`${replayState.playerHealth}%`, barPad + 5, barY2 + barH2 - 4);
  // ── Defender health bar (right→left) ──
  // Outer border/shadow
  const defBarX2 = W - barPad - barW2;
  ctx.fillStyle = "rgba(255,215,0,0.22)"; ctx.fillRect(defBarX2 - 2, barY2 - 2, barW2 + 4, barH2 + 4);
  // Track background
  ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.fillRect(defBarX2, barY2, barW2, barH2);
  const dFill = (barW2 * replayState.defenderHealth) / 100;
  // Fill gradient (right-to-left, so it fills from the right side)
  const dBarGrad = ctx.createLinearGradient(defBarX2, 0, defBarX2 + barW2, 0);
  dBarGrad.addColorStop(0, "#ffd700"); dBarGrad.addColorStop(0.5, "#c8900a"); dBarGrad.addColorStop(1, "#5a3800");
  ctx.fillStyle = dBarGrad; ctx.fillRect(defBarX2 + barW2 - dFill, barY2, dFill, barH2);
  // Shine highlight
  ctx.fillStyle = "rgba(255,255,200,0.15)"; ctx.fillRect(defBarX2 + barW2 - dFill, barY2, dFill, 6);
  ctx.textAlign = "right"; ctx.font = "bold 10px Impact, Arial Black, sans-serif";
  ctx.fillStyle = replayState.defenderHealth > 25 ? "rgba(255,240,180,0.85)" : "#ff6600";
  ctx.fillText(`${replayState.defenderHealth}%`, W - barPad - 5, barY2 + barH2 - 4);

  // ── 3. FIGHTER FIGURES ─────────────────────────────────────────
  type FightPose = "idle" | "melee_attack" | "ranged_attack" | "hit" | "big_hit" | "defend" | "victory";

  let playerPose: FightPose = "idle";
  let defenderPose: FightPose = "idle";
  if (actorIsPlayer) {
    playerPose = evType === "weakness_hit" ? "ranged_attack" : evType === "defense" ? "defend" : "melee_attack";
  } else if (currentEvent?.actorId === battle.defender.id) {
    defenderPose = evType === "weakness_hit" ? "ranged_attack" : evType === "defense" ? "defend" : "melee_attack";
  }
  if (targetIsPlayer) {
    playerPose = playerPose === "idle" ? (evType === "weakness_hit" ? "big_hit" : "hit") : playerPose;
  }
  if (targetIsDefender) {
    defenderPose = defenderPose === "idle" ? (evType === "weakness_hit" ? "big_hit" : "hit") : defenderPose;
  }
  const isGameOver = replayState.playerHealth === 0 || replayState.defenderHealth === 0;
  if (isGameOver) {
    playerPose = replayState.playerHealth >= replayState.defenderHealth ? "victory" : "big_hit";
    defenderPose = replayState.defenderHealth >= replayState.playerHealth ? "victory" : "big_hit";
  }

  const drawFighterFigure = (
    cx: number, groundY: number,
    facing: 1 | -1,
    pose: FightPose,
    bodyColor: string, glowColor: string,
    avatar: HTMLImageElement | null,
    sprite: HTMLImageElement | null,
    displayName: string, score: number,
    phaseOffset: number,
    cards: BuildCard[],
  ) => {
    const f = facing;
    const headR = 27;
    const shoulderW = 66;
    const waistW = 42;
    const torsoH = 76;
    const thighH = 70;
    const shinH = 64;
    const armUpperH = 52;
    const limbW = 20;

    const shoulderY = groundY - thighH - shinH - torsoH;
    const waistY = shoulderY + torsoH;
    const kneeY = waistY + thighH;
    const headY = shoulderY - headR - 5;

    let leanX = 0, leanY = 0;
    let frontLegX2 = f * 16, backLegX2 = -f * 16;
    let frontArmX = f * (shoulderW / 2 - 5), backArmX = -f * (shoulderW / 2 - 5);
    let frontArmEndX = f * (shoulderW / 2 + armUpperH * 0.8), frontArmEndY = shoulderY + armUpperH;
    let backArmEndX = -f * (shoulderW / 2) * 0.3, backArmEndY = shoulderY + armUpperH * 0.85;
    let headOffX = 0;

    switch (pose) {
      case "melee_attack":
        leanX = f * 30; frontLegX2 = f * 40; backLegX2 = -f * 10;
        frontArmEndX = cx + f * (shoulderW / 2 + armUpperH * 1.3) - cx + leanX;
        frontArmEndY = shoulderY + armUpperH * 0.6;
        headOffX = f * 8; break;
      case "ranged_attack":
        leanX = f * 12; leanY = -8;
        frontArmEndX = f * (shoulderW / 2 + armUpperH * 1.1);
        frontArmEndY = shoulderY + armUpperH * 0.5;
        backArmEndX = f * (shoulderW / 2 + armUpperH * 0.7);
        backArmEndY = shoulderY + armUpperH * 0.65; break;
      case "hit":
        leanX = -f * 22;
        frontArmEndX = -f * 20; frontArmEndY = shoulderY + 30;
        backArmEndX = -f * 35; backArmEndY = shoulderY + 50;
        headOffX = -f * 10; break;
      case "big_hit":
        leanX = -f * 45; leanY = 10;
        frontLegX2 = -f * 15; backLegX2 = f * 10;
        frontArmEndX = -f * 50; frontArmEndY = shoulderY - 10;
        backArmEndX = f * 60; backArmEndY = shoulderY + 20;
        headOffX = -f * 18; break;
      case "defend":
        leanY = 12; frontLegX2 = f * 20; backLegX2 = -f * 5;
        frontArmEndX = f * 28; frontArmEndY = shoulderY + 15;
        backArmEndX = -f * 10; backArmEndY = shoulderY + 10; break;
      case "victory":
        frontArmEndX = f * 10; frontArmEndY = shoulderY - armUpperH;
        backArmEndX = -f * 20; backArmEndY = shoulderY + 30; break;
      default:
        frontLegX2 = f * 10; backLegX2 = -f * 12;
        frontArmEndX = f * (shoulderW / 2 + 22); frontArmEndY = shoulderY + armUpperH * 1.1;
        backArmEndX = -f * (shoulderW / 2 - 5); backArmEndY = shoulderY + armUpperH * 0.9;
    }

    // ── Animation: idle breathing + pose transition easing ──────────
    // Continuous idle bob (each fighter has opposite phase for variety)
    const idleBob = Math.sin(animTime * 0.0024 + phaseOffset) * 2.8;
    // Pose transition: half-sine from 0→1→0 over 420ms (punch out and return)
    const poseTNorm = Math.min(1, poseAge / 420);
    const poseEase = Math.sin(poseTNorm * Math.PI); // 0→1→0 arc

    // Scale pose offsets by poseEase (they start at 0, peak at ~210ms, return to 0)
    const animLeanX = leanX * poseEase;
    const animLeanY = leanY * poseEase + idleBob;

    const bx = cx + animLeanX;
    const by = animLeanY;

    // Shadow ellipse (shifts slightly with lean)
    ctx.beginPath(); ctx.ellipse(cx + animLeanX * 0.3, groundY + 6, 48, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill();

    // ── AI SPRITE (full-body image, drawn instead of stick figure) ──
    if (sprite) {
      const spriteH = 320;
      const spriteW = 320;
      const spriteX = cx - spriteW / 2;
      const spriteY = groundY - spriteH;

      // Animated pose offsets (rise and fall with poseEase)
      let offsetX = 0, offsetY = idleBob;
      if (pose === "big_hit") { offsetX = -facing * 32 * poseEase; offsetY += 10 * poseEase; }
      else if (pose === "melee_attack") { offsetX = facing * 22 * poseEase; }
      else if (pose === "hit") { offsetX = -facing * 16 * poseEase; }
      else if (pose === "ranged_attack") { offsetY -= 10 * poseEase; }
      else if (pose === "victory") { offsetY -= 8 * Math.abs(Math.sin(animTime * 0.003)); }

      // Pose-driven scale: attack = bigger, hit = shrink, victory = gentle pulse
      let poseScale = 1;
      if (pose === "melee_attack") poseScale = 1 + 0.07 * poseEase;
      else if (pose === "ranged_attack") poseScale = 1 + 0.04 * poseEase;
      else if (pose === "hit") poseScale = 1 - 0.06 * poseEase;
      else if (pose === "big_hit") poseScale = 1 - 0.1 * poseEase;
      else if (pose === "victory") poseScale = 1 + 0.03 * Math.abs(Math.sin(animTime * 0.003));

      ctx.save();
      // Flip horizontally for defender (facing left)
      if (facing === -1) {
        ctx.translate(cx * 2, 0);
        ctx.scale(-1, 1);
      }
      // Apply pose offset
      ctx.translate(offsetX * facing, offsetY);

      // Scale from bottom-center (ground-pin)
      if (poseScale !== 1) {
        ctx.translate(cx, groundY);
        ctx.scale(poseScale, poseScale);
        ctx.translate(-cx, -groundY);
      }

      // Glow halo behind sprite — larger and brighter during attacks, team-colored
      const haloAlpha = (pose === "melee_attack" || pose === "ranged_attack") ? 0.55 : 0.30;
      const haloRadius = (pose === "melee_attack" || pose === "ranged_attack") ? 180 : 150;
      const halo = ctx.createRadialGradient(cx, groundY - spriteH * 0.5, 20, cx, groundY - spriteH * 0.5, haloRadius);
      halo.addColorStop(0, glowColor.replace(/[\d.]+\)$/, `${haloAlpha})`));
      halo.addColorStop(0.5, glowColor.replace(/[\d.]+\)$/, `${haloAlpha * 0.4})`));
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.fillRect(spriteX - 80, spriteY - 60, spriteW + 160, spriteH + 80);

      // Draw sprite using screen blend mode to dissolve dark background into arena
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(sprite, spriteX, spriteY, spriteW, spriteH);
      ctx.globalCompositeOperation = "source-over";

      // Hit flash: red overlay pulse when taking damage
      if ((pose === "hit" || pose === "big_hit") && poseEase > 0.05) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.55 * poseEase;
        ctx.fillStyle = pose === "big_hit" ? "#ff0000" : "#cc2200";
        ctx.fillRect(spriteX, spriteY, spriteW, spriteH);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // Attack charge: bright white flash at peak of attack
      if ((pose === "melee_attack" || pose === "ranged_attack") && poseEase > 0.7) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (poseEase - 0.7) / 0.3 * 0.18;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(spriteX, spriteY, spriteW, spriteH);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // Avatar face overlay in head area (top-center of sprite)
      if (avatar) {
        const faceR = 26;
        const faceCX = cx;
        const faceCY = spriteY + 40;
        ctx.save();
        ctx.beginPath(); ctx.arc(faceCX, faceCY, faceR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatar, faceCX - faceR, faceCY - faceR, faceR * 2, faceR * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(faceCX, faceCY, faceR, 0, Math.PI * 2);
        ctx.strokeStyle = bodyColor; ctx.lineWidth = 2; ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
        ctx.stroke(); ctx.shadowBlur = 0;
      }

      ctx.restore();

      // Glowing name plate below fighter
      const npW = 180, npH = 24;
      const npX = cx - npW / 2;
      const npY = groundY + 10;
      // Nameplate background
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(npX, npY, npW, npH);
      // Nameplate top accent line (team color)
      ctx.fillStyle = bodyColor;
      ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
      ctx.fillRect(npX, npY, npW, 2);
      ctx.shadowBlur = 0;
      // Nameplate text
      ctx.textAlign = "center";
      ctx.font = "bold 11px Impact, Arial Black, sans-serif";
      ctx.fillStyle = bodyColor === "#cc0000" ? "#ff8888" : "#ffd700";
      ctx.shadowColor = glowColor; ctx.shadowBlur = 10;
      ctx.fillText(`${displayName.toUpperCase()} · ${score}pts`, cx, npY + npH - 6);
      ctx.shadowBlur = 0;

      // ── Equipment rack below nameplate ──────────────────────────
      if (cards.length > 0) {
        const slotW = 52, slotH = 18, slotGap = 4;
        const totalW = cards.length * slotW + (cards.length - 1) * slotGap;
        const rackX = cx - totalW / 2;
        const rackY = npY + npH + 4;

        const SLOT_COLORS: Record<string, { bg: string; border: string; stat: string; icon: string }> = {
          viewpoint: { bg: 'rgba(180,20,0,0.45)',   border: '#cc3300', stat: 'ATK', icon: '⚔' },
          rule:      { bg: 'rgba(10,60,140,0.45)',  border: '#2266bb', stat: 'DEF', icon: '⛨' },
          taboo:     { bg: 'rgba(100,0,160,0.45)',  border: '#8833cc', stat: 'PEN', icon: '✦' },
        };
        const RARITY_COLORS = [
          { min: 50, color: '#ffd700' },
          { min: 36, color: '#bb55ff' },
          { min: 22, color: '#4499ff' },
          { min: 0,  color: '#777777' },
        ];

        cards.forEach((card, i) => {
          const sx = rackX + i * (slotW + slotGap);
          const cfg = SLOT_COLORS[card.kind] ?? SLOT_COLORS.viewpoint;
          const total = card.atk + card.def + card.pen + card.spd;
          const rarityColor = (RARITY_COLORS.find((r) => total >= r.min) ?? RARITY_COLORS[RARITY_COLORS.length - 1]).color;

          // Slot background
          ctx.fillStyle = cfg.bg;
          ctx.fillRect(sx, rackY, slotW, slotH);
          // Slot border
          ctx.strokeStyle = cfg.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, rackY + 0.5, slotW - 1, slotH - 1);
          // Rarity top strip
          ctx.fillStyle = rarityColor;
          ctx.fillRect(sx, rackY, slotW, 2);
          // Icon
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = rarityColor;
          ctx.shadowColor = rarityColor; ctx.shadowBlur = 4;
          ctx.fillText(cfg.icon, sx + 3, rackY + 13);
          ctx.shadowBlur = 0;
          // Stat value
          const statVal = cfg.stat === 'ATK' ? card.atk : cfg.stat === 'DEF' ? card.def : card.pen;
          ctx.font = 'bold 9px "Courier New", monospace';
          ctx.fillStyle = rarityColor;
          ctx.textAlign = 'right';
          ctx.fillText(`${cfg.stat}${statVal}`, sx + slotW - 3, rackY + 13);
        });
        ctx.textAlign = 'center';
      }

      return; // skip stick figure
    }

    // Back leg
    ctx.save(); ctx.strokeStyle = "rgba(15,0,5,0.92)"; ctx.lineWidth = limbW - 2; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx + backLegX2, waistY + by);
    ctx.lineTo(bx + backLegX2 * 0.6, kneeY + by + 4);
    ctx.lineTo(bx + backLegX2 * 0.8, groundY);
    ctx.stroke(); ctx.restore();

    // Back arm
    ctx.save(); ctx.strokeStyle = "rgba(10,0,3,0.88)"; ctx.lineWidth = limbW - 4; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx + backArmX, shoulderY + by);
    ctx.lineTo(bx + backArmEndX, backArmEndY + by);
    ctx.stroke(); ctx.restore();

    // Torso
    ctx.beginPath();
    ctx.moveTo(bx - shoulderW / 2, shoulderY + by);
    ctx.lineTo(bx + shoulderW / 2, shoulderY + by);
    ctx.lineTo(bx + waistW / 2, waistY + by);
    ctx.lineTo(bx - waistW / 2, waistY + by);
    ctx.closePath();
    const tg2 = ctx.createLinearGradient(bx - shoulderW / 2, 0, bx + shoulderW / 2, 0);
    tg2.addColorStop(0, "rgba(6,0,2,0.96)");
    tg2.addColorStop(0.5, `${bodyColor}28`);
    tg2.addColorStop(1, "rgba(4,0,1,0.96)");
    ctx.fillStyle = tg2; ctx.fill();
    ctx.strokeStyle = bodyColor; ctx.lineWidth = 2.5;
    ctx.shadowColor = glowColor; ctx.shadowBlur = 12;
    ctx.stroke(); ctx.shadowBlur = 0;

    // Chest emblem dot
    ctx.beginPath(); ctx.arc(bx, shoulderY + torsoH * 0.38 + by, 5, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor; ctx.shadowColor = glowColor; ctx.shadowBlur = 10;
    ctx.fill(); ctx.shadowBlur = 0;

    // Front leg
    ctx.save(); ctx.strokeStyle = "rgba(8,0,2,0.95)"; ctx.lineWidth = limbW; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx + frontLegX2, waistY + by);
    ctx.lineTo(bx + frontLegX2 * 0.9, kneeY + by);
    ctx.lineTo(bx + frontLegX2 * 1.1, groundY);
    ctx.stroke();
    ctx.strokeStyle = bodyColor; ctx.lineWidth = 2; ctx.shadowColor = glowColor; ctx.shadowBlur = 7;
    ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();

    // Front arm
    ctx.save(); ctx.strokeStyle = "rgba(8,0,2,0.95)"; ctx.lineWidth = limbW - 2; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx + frontArmX, shoulderY + by);
    const elbX = bx + frontArmEndX * 0.55 + frontArmX * 0.45;
    const elbY = (shoulderY + by + frontArmEndY + by) * 0.5 + 8;
    ctx.quadraticCurveTo(elbX, elbY, bx + frontArmEndX, frontArmEndY + by);
    ctx.stroke();
    ctx.strokeStyle = bodyColor; ctx.lineWidth = 2; ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
    ctx.stroke(); ctx.shadowBlur = 0;
    // Fist
    ctx.beginPath(); ctx.arc(bx + frontArmEndX, frontArmEndY + by, 10, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor; ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
    ctx.fill(); ctx.shadowBlur = 0; ctx.restore();

    // Head
    const hx = bx + headOffX, hy = headY + by;
    ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    if (avatar) {
      ctx.clip();
      ctx.drawImage(avatar, hx - headR, hy - headR, headR * 2, headR * 2);
    } else {
      ctx.fillStyle = "rgba(12,2,4,0.95)"; ctx.fill();
      // Eyes
      ctx.fillStyle = bodyColor; ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(hx + f * 7, hy - 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx - f * 3, hy - 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    // Head border
    ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.strokeStyle = bodyColor; ctx.lineWidth = 2.5; ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
    ctx.stroke(); ctx.shadowBlur = 0;

    // Glowing name plate below fighter (stick figure path)
    const npW2 = 180, npH2 = 24;
    const npX2 = cx - npW2 / 2;
    const npY2 = groundY + 10;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(npX2, npY2, npW2, npH2);
    ctx.fillStyle = bodyColor;
    ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
    ctx.fillRect(npX2, npY2, npW2, 2);
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.font = "bold 11px Impact, Arial Black, sans-serif";
    ctx.fillStyle = bodyColor === "#cc0000" ? "#ff8888" : "#ffd700";
    ctx.shadowColor = glowColor; ctx.shadowBlur = 10;
    ctx.fillText(`${displayName.toUpperCase()} · ${score}pts`, cx, npY2 + npH2 - 6);
    ctx.shadowBlur = 0;
  };

  drawFighterFigure(285, floorY, 1, playerPose, "#cc0000", "rgba(255,30,0,0.85)", playerAvatar, playerSprite, battle.player.displayName, replayState.playerScore, 0, battle.player.cards ?? []);
  drawFighterFigure(W - 285, floorY, -1, defenderPose, "#c8900a", "rgba(255,200,0,0.8)", defenderAvatar, defenderSprite, battle.defender.displayName, replayState.defenderScore, Math.PI, battle.defender.cards ?? []);

  // ── 4. ATTACK EFFECTS ──────────────────────────────────────────
  const isWeaknessHit = evType === "weakness_hit";
  const isMeleeHit = evType === "attack";

  if (isWeaknessHit) {
    // Screen-edge vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.88);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(0.6, "rgba(140,0,0,0.08)");
    vig.addColorStop(1, "rgba(255,0,0,0.45)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // Energy orb / projectile
    const fromX = actorIsPlayer ? 360 : W - 360;
    const toX = actorIsPlayer ? W - 285 : 285;
    const orbY = floorY - 170;
    const orbX = (fromX + toX) / 2;
    // Orb glow halo (always drawn)
    const orbGlow2 = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, 80);
    orbGlow2.addColorStop(0, "rgba(255,220,0,0.85)");
    orbGlow2.addColorStop(0.4, "rgba(255,80,0,0.4)");
    orbGlow2.addColorStop(1, "transparent");
    ctx.fillStyle = orbGlow2; ctx.fillRect(orbX - 80, orbY - 80, 160, 160);
    // Use AI orb image if loaded, else canvas arc
    if (energyOrb) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = "rgba(255,200,0,1)"; ctx.shadowBlur = 40;
      // Pulsating rotation animation
      ctx.translate(orbX, orbY);
      ctx.rotate((animTime * 0.002) % (Math.PI * 2));
      ctx.drawImage(energyOrb, -40, -40, 80, 80);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(orbX, orbY, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd700"; ctx.shadowColor = "rgba(255,215,0,1)"; ctx.shadowBlur = 30;
      ctx.fill(); ctx.shadowBlur = 0;
    }
    // Orb trail
    ctx.save(); ctx.strokeStyle = "rgba(255,160,0,0.45)"; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(fromX, orbY + 30); ctx.quadraticCurveTo((fromX + orbX) / 2, orbY - 25, orbX, orbY);
    ctx.stroke(); ctx.restore();

    // Lightning arc
    const lx1 = actorIsPlayer ? 360 : W - 360;
    const lx2 = actorIsPlayer ? W - 260 : 260;
    const ly2 = floorY - 155;
    const zigPts: [number, number][] = [[lx1, ly2]];
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      zigPts.push([lx1 + (lx2 - lx1) * t, ly2 + (i % 2 === 0 ? 28 : -28)]);
    }
    zigPts.push([lx2, ly2]);
    ctx.save();
    ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 4.5; ctx.shadowColor = "rgba(255,215,0,1)"; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.moveTo(zigPts[0][0], zigPts[0][1]);
    zigPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.88)"; ctx.lineWidth = 1.5; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.moveTo(zigPts[0][0], zigPts[0][1]);
    zigPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.stroke(); ctx.restore();

    // Impact ring
    const impX = actorIsPlayer ? W - 285 : 285;
    const impY = floorY - 165;
    for (const r of [55, 35]) {
      ctx.beginPath(); ctx.arc(impX, impY, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${0.65 - r * 0.007})`; ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(255,215,0,0.7)"; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
    }

  } else if (isMeleeHit) {
    // Melee impact — use AI hit effect image if loaded
    const impX2 = actorIsPlayer ? 480 : W - 480;
    const impY2 = floorY - 180;
    if (hitEffect) {
      ctx.save();
      const effectAlpha = Math.max(0, 1 - poseAge / 500);
      ctx.globalAlpha = effectAlpha;
      ctx.shadowColor = "rgba(255,80,0,1)"; ctx.shadowBlur = 30;
      // Slight scale pulse
      const effectScale = 1 + 0.15 * Math.sin(poseAge * 0.015);
      const effectSize = 180 * effectScale;
      ctx.drawImage(hitEffect, impX2 - effectSize / 2, impY2 - effectSize / 2, effectSize, effectSize);
      ctx.restore();
    } else {
      for (const r of [16, 34, 52]) {
        ctx.beginPath(); ctx.arc(impX2, impY2, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,70,0,${0.65 - r * 0.009})`; ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255,50,0,0.6)"; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    // Spark rays (always drawn for kinetic feel)
    const sparkA = [0, 0.45, 1.0, 1.6, 2.2, 2.8, 3.4, 4.0, 4.7, 5.3];
    for (const a of sparkA) {
      const len = 22 + Math.sin(a * 2.7) * 14;
      ctx.beginPath();
      ctx.moveTo(impX2 + Math.cos(a) * 14, impY2 + Math.sin(a) * 14);
      ctx.lineTo(impX2 + Math.cos(a) * (14 + len), impY2 + Math.sin(a) * (14 + len));
      ctx.strokeStyle = Math.sin(a) > 0 ? "#ff4400" : "#ffd060";
      ctx.lineWidth = 2.5; ctx.shadowColor = "rgba(255,100,0,0.8)"; ctx.shadowBlur = 8;
      ctx.stroke(); ctx.shadowBlur = 0;
    }

    // ── RED SLASH LINES on melee attack ──
    const slashX = actorIsPlayer ? W - 285 : 285;
    const slashY = floorY - 200;
    const slashAlpha = Math.max(0, 1 - poseAge / 500);
    ctx.save();
    ctx.globalAlpha = slashAlpha;
    ctx.strokeStyle = "#ff2200";
    ctx.shadowColor = "rgba(255,30,0,1)";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    // Three diagonal slash marks
    const slashDir = actorIsPlayer ? -1 : 1;
    for (let si = 0; si < 3; si++) {
      const sy = slashY - 30 + si * 28;
      ctx.beginPath();
      ctx.moveTo(slashX + slashDir * 55 + si * slashDir * 8, sy - 30);
      ctx.lineTo(slashX - slashDir * 45 + si * slashDir * 8, sy + 30);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── PARTICLE TRAIL during movement ──
    const trailX = actorIsPlayer ? 285 : W - 285;
    for (let pi = 0; pi < 5; pi++) {
      const tAlpha = Math.max(0, (1 - poseAge / 600) * (1 - pi * 0.18));
      const tX = trailX + (actorIsPlayer ? 1 : -1) * pi * -18;
      const tY = floorY - 150 - pi * 12 + Math.sin(pi * 1.4) * 15;
      const tR = 8 - pi * 1.2;
      if (tR <= 0) continue;
      ctx.save();
      ctx.globalAlpha = tAlpha;
      const tGrad = ctx.createRadialGradient(tX, tY, 0, tX, tY, tR * 2);
      tGrad.addColorStop(0, "#ff5500");
      tGrad.addColorStop(1, "transparent");
      ctx.fillStyle = tGrad;
      ctx.beginPath(); ctx.arc(tX, tY, tR * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ── 5. EVENT TEXT PANEL ────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, H - 98, W, 98);
  ctx.fillStyle = "rgba(140,0,0,0.5)"; ctx.fillRect(0, H - 100, W, 2);

  ctx.textAlign = "center";
  if (isWeaknessHit) {
    ctx.font = "700 44px Impact, Arial Black, sans-serif";
    ctx.fillStyle = "#ffd700"; ctx.shadowColor = "rgba(255,100,0,0.95)"; ctx.shadowBlur = 30;
    ctx.fillText("WEAKNESS HIT", W / 2, H - 56); ctx.shadowBlur = 0;
  } else {
    ctx.font = `700 ${evType === "attack" ? 34 : 30}px Impact, Arial Black, sans-serif`;
    ctx.fillStyle = isMeleeHit ? "#ff4400" : "#e8d4b8";
    ctx.shadowColor = "rgba(200,0,0,0.65)"; ctx.shadowBlur = 14;
    ctx.fillText(currentEvent?.title ?? "STAND BY", W / 2, H - 58); ctx.shadowBlur = 0;
  }
  ctx.font = "500 14px 'Courier New', monospace";
  ctx.fillStyle = "rgba(232,212,184,0.72)";
  ctx.fillText(currentEvent?.description ?? "等待战斗数据载入。", W / 2, H - 30, W - 180);
  ctx.textAlign = "left";

  // ── 6. BIG_HIT SCREEN FLASH + "HIT!" TEXT ────────────────────
  const isBigHit = replayState.currentEvent?.type === "weakness_hit";
  if (isBigHit && poseAge < 600) {
    const flashAlpha = Math.max(0, 0.38 * (1 - poseAge / 600));
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // "WEAKNESS HIT" already drawn — also flash at screen edges
    const edgeGlow = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
    edgeGlow.addColorStop(0, "transparent");
    edgeGlow.addColorStop(1, `rgba(255,0,0,${flashAlpha * 0.6})`);
    ctx.fillStyle = edgeGlow;
    ctx.fillRect(0, 0, W, H);

    // KO explosion asset — draw on the hit-side with alpha tied to poseEase
    if (koExplosion) {
      const poseEase = Math.max(0, 1 - poseAge / 600);
      const targetIsP = replayState.currentEvent?.targetId === battle.player.id;
      const explosionX = targetIsP ? W * 0.25 : W * 0.75;
      const explosionSize = 280 * (0.7 + 0.3 * poseEase);
      ctx.save();
      ctx.globalAlpha = poseEase * 0.88;
      ctx.drawImage(
        koExplosion,
        explosionX - explosionSize / 2,
        H / 2 - explosionSize / 2,
        explosionSize,
        explosionSize,
      );
      ctx.restore();
    }
  }

  // ── 7. WIN SCREEN OVERLAY (phase === "complete") ──────────────
  if (phase === "complete") {
    // Dark overlay
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Pulsing winner-side border glow
    const borderAlpha = 0.4 + 0.35 * Math.sin(animTime * 0.004);
    const isPlayerWinner = battle.winnerId === battle.player.id;
    ctx.save();
    ctx.strokeStyle = isPlayerWinner ? `rgba(255,30,0,${borderAlpha})` : `rgba(255,215,0,${borderAlpha})`;
    ctx.lineWidth = 12;
    if (isPlayerWinner) {
      ctx.strokeRect(6, 6, W / 2 - 12, H - 12);
    } else {
      ctx.strokeRect(W / 2 + 6, 6, W / 2 - 12, H - 12);
    }
    ctx.restore();

    // Winner crown image above name
    if (winnerCrown) {
      const crownSize = 120;
      const crownX = W / 2 - crownSize / 2;
      const crownY = H / 2 - 180;
      ctx.save();
      ctx.shadowColor = "rgba(255,215,0,0.8)";
      ctx.shadowBlur = 30;
      ctx.drawImage(winnerCrown, crownX, crownY, crownSize, crownSize);
      ctx.restore();
    }

    // Winner name in huge gold text
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const winnerColor = isPlayerWinner ? "#ff3300" : "#ffd700";
    const winnerShadow = isPlayerWinner ? "rgba(255,30,0,1)" : "rgba(255,215,0,1)";
    ctx.font = `bold 88px Impact, "Arial Black", sans-serif`;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 10;
    ctx.strokeText(winnerName.toUpperCase(), W / 2, H / 2 - 40);
    ctx.fillStyle = winnerColor;
    ctx.shadowColor = winnerShadow;
    ctx.shadowBlur = 40;
    ctx.fillText(winnerName.toUpperCase(), W / 2, H / 2 - 40);
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    // AI victory/ko image below name
    const resultImg = isPlayerWinner ? koText : victoryText;
    if (resultImg) {
      ctx.save();
      const imgW = 360;
      const imgH = imgW * (resultImg.naturalHeight / Math.max(1, resultImg.naturalWidth));
      ctx.shadowColor = isPlayerWinner ? "rgba(255,0,0,0.9)" : "rgba(255,215,0,0.9)";
      ctx.shadowBlur = 40;
      ctx.drawImage(resultImg, W / 2 - imgW / 2, H / 2 + 30, imgW, imgH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold 64px Impact, "Arial Black", sans-serif`;
      ctx.strokeStyle = "#000"; ctx.lineWidth = 8;
      ctx.strokeText("WINS!", W / 2, H / 2 + 70);
      ctx.fillStyle = "#ff2200"; ctx.shadowColor = "rgba(255,30,0,1)"; ctx.shadowBlur = 30;
      ctx.fillText("WINS!", W / 2, H / 2 + 70);
      ctx.shadowBlur = 0; ctx.textBaseline = "alphabetic";
      ctx.restore();
    }
  }

  // ── 8. ANNOUNCER TEXT OVERLAY ─────────────────────────────────
  if (announcer && announcer.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = announcer.alpha;

    // Use AI images for FIGHT! and ROUND announcements, canvas text for others
    const isFightAnnounce = announcer.text === "FIGHT!" && fightText;
    const isRoundAnnounce = announcer.text.startsWith("ROUND") && roundBanner;
    if (isFightAnnounce && fightText) {
      const imgW = 480 * announcer.scale;
      const imgH = imgW * (fightText.naturalHeight / Math.max(1, fightText.naturalWidth));
      ctx.shadowColor = "rgba(255,30,0,1)";
      ctx.shadowBlur = 60;
      ctx.drawImage(fightText, W / 2 - imgW / 2, H / 2 - imgH / 2, imgW, imgH);
      ctx.shadowBlur = 0;
    } else if (isRoundAnnounce && roundBanner) {
      const bannerW = 520 * announcer.scale;
      const bannerH = bannerW * (roundBanner.naturalHeight / Math.max(1, roundBanner.naturalWidth));
      ctx.shadowColor = "rgba(255,200,0,0.8)";
      ctx.shadowBlur = 40;
      ctx.drawImage(roundBanner, W / 2 - bannerW / 2, H / 2 - bannerH / 2, bannerW, bannerH);
      ctx.shadowBlur = 0;
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontSize = Math.floor(120 * announcer.scale);
      ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 10;
      ctx.strokeText(announcer.text, W / 2, H / 2);
      ctx.fillStyle = announcer.color;
      ctx.shadowColor = announcer.color === "#ffd700" ? "rgba(255,200,0,1)" : "rgba(255,30,0,1)";
      ctx.shadowBlur = 50;
      ctx.fillText(announcer.text, W / 2, H / 2);
      ctx.shadowBlur = 0;
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }
}

async function fetchBattlePackage(battleId: string) {
  const response = await fetch(`/api/arena/battles/${battleId}`, { cache: "no-store" });

  if (response.ok) {
    return (await response.json()) as BattlePackage;
  }

  const local = localStorage.getItem(battleStorageKey(battleId));

  if (!local) {
    throw new Error("未找到战斗包。");
  }

  return JSON.parse(local) as BattlePackage;
}

const formatScoreDelta = (side: ArenaBattleCompetitionSide | null) =>
  side ? `${side.scoreDelta > 0 ? "+" : ""}${side.scoreDelta}` : "-";

const winnerLabel = (battle: BattlePackage) =>
  battle.winnerId === battle.player.id
    ? `${battle.player.displayName} 获胜`
    : `${battle.defender.displayName} 守擂成功`;

// Mini stat bar for replay sidebar
function MiniStatBar({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', width: '2.2rem', flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: '5px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(60,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round((value / max) * 100)}%`, background: accent, transition: 'width 350ms ease' }} />
      </div>
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: 'var(--text-dim)', width: '1.5rem' }}>{value}</span>
    </div>
  );
}

// Soul stats mini block for replay
function SoulMiniBlock({ soul, accent }: { soul: SoulStats; accent: string }) {
  return (
    <div className="flex flex-col gap-1">
      {(Object.keys(soulLabels) as SoulStatKey[]).map((key) => (
        <MiniStatBar key={key} label={soulLabels[key]} value={soul[key]} max={99} accent={accent} />
      ))}
    </div>
  );
}

// Share button
function ShareButton({ battleId }: { battleId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/arena/${battleId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className="mk-button-ghost px-4 py-3" onClick={handleCopy} type="button">
      {copied ? "已复制 ✓" : "复制链接"}
    </button>
  );
}

// Health bar component
function HealthBar({ value, gold = false }: { value: number; gold?: boolean }) {
  return (
    <div className="mk-health-track" style={{ flex: 1 }}>
      <div
        className={gold ? "mk-health-fill-gold" : "mk-health-fill"}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function BattleReplay({ battleId }: { battleId: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playerAvatarRef = useRef<HTMLImageElement | null>(null);
  const defenderAvatarRef = useRef<HTMLImageElement | null>(null);
  const playerSpriteRef = useRef<HTMLImageElement | null>(null);
  const defenderSpriteRef = useRef<HTMLImageElement | null>(null);
  const arenaBgRef = useRef<HTMLImageElement | null>(null);
  const arenaFloorRef = useRef<HTMLImageElement | null>(null);
  const winnerCrownRef = useRef<HTMLImageElement | null>(null);
  const koExplosionRef = useRef<HTMLImageElement | null>(null);
  const hitEffectRef = useRef<HTMLImageElement | null>(null);
  const energyOrbRef = useRef<HTMLImageElement | null>(null);
  const fightTextRef = useRef<HTMLImageElement | null>(null);
  const roundBannerRef = useRef<HTMLImageElement | null>(null);
  const koTextRef = useRef<HTMLImageElement | null>(null);
  const victoryTextRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef(0);
  const replayStateRef = useRef<ReplayState | null>(null);
  const poseStartTimeRef = useRef(0);
  const lastPlayheadRef = useRef(-1);
  const avatarImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [battle, setBattle] = useState<BattlePackage | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [winnerProfile, setWinnerProfile] = useState<ArenaCompetitorProfile | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [audienceMembers, setAudienceMembers] = useState<AudienceMemberCanvas[]>([]);
  const [liveStartAt, setLiveStartAt] = useState<string | null>(null);
  const [goLivePending, setGoLivePending] = useState(false);
  const [votes, setVotes] = useState({ player: 0, defender: 0 });
  const [votePending, setVotePending] = useState(false);
  const [announcer, setAnnouncer] = useState<AnnouncerState | null>(null);
  const announcerRef = useRef<AnnouncerState | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchBattlePackage(battleId);
        setBattle(payload);
        setPlayhead(0);
        // Trigger announcer sequence: ROUND 1 → FIGHT!
        const startAnnounce = (text: string, color: string, delay: number, duration: number) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              const startTime = performance.now();
              const animate = (now: number) => {
                const elapsed = now - startTime;
                const t = elapsed / duration;
                const alpha = t < 0.15 ? t / 0.15 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
                const scale = t < 0.15 ? 0.5 + 0.5 * (t / 0.15) : 1;
                const state = { text, color, scale, alpha };
                announcerRef.current = state;
                setAnnouncer({ ...state });
                if (t < 1) {
                  requestAnimationFrame(animate);
                } else {
                  announcerRef.current = null;
                  setAnnouncer(null);
                  resolve();
                }
              };
              requestAnimationFrame(animate);
            }, delay);
          });
        void startAnnounce("ROUND 1", "#ffd700", 300, 1400)
          .then(() => startAnnounce("FIGHT!", "#ff2200", 200, 1000));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "战斗数据载入失败。");
      }
    })();
  }, [battleId]);

  // Load fighter avatars + AI sprites from localStorage (alpha=player, beta=defender)
  // Falls back to server-side default sprites if localStorage is empty
  useEffect(() => {
    const loadImgFromUrl = (url: string, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      const img = new Image();
      img.onload = () => { ref.current = img; };
      img.onerror = () => { ref.current = null; };
      img.src = url;
    };

    const loadImgWithFallback = (
      key: string,
      ref: React.MutableRefObject<HTMLImageElement | null>,
      fallbackUrl: string,
    ) => {
      const dataUrl = localStorage.getItem(key);
      if (dataUrl) {
        loadImgFromUrl(dataUrl, ref);
      } else {
        // Fall back to server-side generated sprite
        loadImgFromUrl(fallbackUrl, ref);
      }
    };

    loadImgWithFallback("soul-arena:avatar:alpha", playerAvatarRef, "");
    loadImgWithFallback("soul-arena:avatar:beta", defenderAvatarRef, "");
    loadImgWithFallback("soul-arena:sprite:alpha", playerSpriteRef, "/sprite-alpha.png");
    loadImgWithFallback("soul-arena:sprite:beta", defenderSpriteRef, "/sprite-beta.png");
  }, []);

  // Preload AI-generated arena background and floor assets
  useEffect(() => {
    const loadStaticImg = (src: string, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      const img = new Image();
      img.onload = () => { ref.current = img; };
      img.onerror = () => { ref.current = null; };
      img.src = src;
    };
    loadStaticImg("/arena-bg.png", arenaBgRef);
    loadStaticImg("/arena-floor.png", arenaFloorRef);
    loadStaticImg("/winner-crown.png", winnerCrownRef);
    loadStaticImg("/ko-explosion.png", koExplosionRef);
    loadStaticImg("/hit-effect.png", hitEffectRef);
    loadStaticImg("/energy-orb.png", energyOrbRef);
    loadStaticImg("/fight-text.png", fightTextRef);
    loadStaticImg("/round-banner.png", roundBannerRef);
    loadStaticImg("/ko-text.png", koTextRef);
    loadStaticImg("/victory-text.png", victoryTextRef);
  }, []);

  const winnerCompetitorId = useMemo(() => {
    if (!battle?.competition) {
      return null;
    }

    return battle.winnerId === battle.player.id
      ? battle.competition.player?.competitorId ?? null
      : battle.competition.defender?.competitorId ?? null;
  }, [battle]);


  useEffect(() => {
    if (!battle?.competition) {
      setWinnerProfile(null);
      return;
    }

    const competitorId =
      battle.winnerId === battle.player.id
        ? battle.competition.player?.competitorId
        : battle.competition.defender?.competitorId;

    if (!competitorId) {
      return;
    }

    void (async () => {
      const response = await fetch(`/api/arena/profile?competitorId=${encodeURIComponent(competitorId)}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        return;
      }
      const data = (await response.json()) as ProfileResponse;
      setWinnerProfile(data.profiles[0]?.profile ?? null);
    })();
  }, [battle]);

  const replayState = useMemo(
    () => (battle ? deriveReplayState(battle, playhead) : null),
    [battle, playhead],
  );
  const canRecord =
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    typeof HTMLCanvasElement !== "undefined";
  const reachedEnd = Boolean(battle && playhead >= battle.events.length - 1);
  const playbackActive = isPlaying && !reachedEnd;
  const winnerCompetition = useMemo(() => {
    if (!battle?.competition) return null;
    return battle.winnerId === battle.player.id ? battle.competition.player : battle.competition.defender;
  }, [battle]);
  const loserCompetition = useMemo(() => {
    if (!battle?.competition) return null;
    return battle.winnerId === battle.player.id ? battle.competition.defender : battle.competition.player;
  }, [battle]);

  // Fetch audience members every 10 seconds
  useEffect(() => {
    const fetchAudience = () => {
      void fetch("/api/arena/audience", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { members: Array<{ id: string; displayName: string; avatarDataUrl: string | null }> } | null) => {
          if (!data?.members) return;
          setAudienceMembers((prev) => {
            const existingMap = new Map(prev.map((m) => [m.id, m]));
            return data.members.map((m) => {
              const existing = existingMap.get(m.id);
              if (existing) return existing;
              // Decode avatar if available
              if (m.avatarDataUrl && !avatarImageCacheRef.current.has(m.id)) {
                const img = new Image();
                img.onload = () => { avatarImageCacheRef.current.set(m.id, img); };
                img.src = m.avatarDataUrl;
              }
              return {
                id: m.id,
                displayName: m.displayName,
                avatarDataUrl: m.avatarDataUrl,
                seatX: 20 + Math.random() * (1280 - 40),
                seatRow: Math.floor(Math.random() * 3),
                bobPhase: Math.random() * Math.PI * 2,
              };
            });
          });
        })
        .catch(() => null);
    };
    fetchAudience();
    const interval = setInterval(fetchAudience, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Poll vote counts every 5 seconds
  useEffect(() => {
    if (!battle) return;
    const fetchVotes = () => {
      void fetch(`/api/arena/vote?battleId=${encodeURIComponent(battle.id)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { player: number; defender: number } | null) => {
          if (data) setVotes(data);
        })
        .catch(() => null);
    };
    fetchVotes();
    const interval = setInterval(fetchVotes, 5_000);
    return () => clearInterval(interval);
  }, [battle]);

  // Poll live session for auto-start
  useEffect(() => {
    const poll = () => {
      void fetch("/api/arena/live", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { battleId: string | null; startAt: string | null; secondsUntilStart: number | null } | null) => {
          if (!data?.startAt) return;
          setLiveStartAt(data.startAt);
          // If the startAt has arrived and we have a matching battle, auto-start playback
          if (data.secondsUntilStart !== null && data.secondsUntilStart <= 0) {
            setIsPlaying(true);
            setPlayhead(0);
          }
        })
        .catch(() => null);
    };
    poll();
    const interval = setInterval(poll, 3_000);
    return () => clearInterval(interval);
  }, []);

  // Keep latest replayState accessible inside RAF without closure capture
  useEffect(() => { replayStateRef.current = replayState; }, [replayState]);

  // Keep latest announcer in ref for RAF access
  useEffect(() => { announcerRef.current = announcer; }, [announcer]);

  // Track pose start time whenever playhead advances (new battle event)
  useEffect(() => {
    if (playhead !== lastPlayheadRef.current) {
      poseStartTimeRef.current = performance.now();
      lastPlayheadRef.current = playhead;
    }
  }, [playhead]);

  // RAF animation loop — runs continuously while battle is loaded
  const phase: "playing" | "complete" = reachedEnd ? "complete" : "playing";
  const winnerName = battle
    ? (battle.winnerId === battle.player.id ? battle.player.displayName : battle.defender.displayName)
    : "";

  const startLoop = useCallback(() => {
    const loop = (time: number) => {
      const rs = replayStateRef.current;
      if (canvasRef.current && rs && battle) {
        const poseAge = time - poseStartTimeRef.current;
        drawStage(
          canvasRef.current, battle, rs,
          playerAvatarRef.current, defenderAvatarRef.current,
          playerSpriteRef.current, defenderSpriteRef.current,
          time, poseAge,
          audienceMembers,
          avatarImageCacheRef.current,
          arenaBgRef.current,
          arenaFloorRef.current,
          announcerRef.current,
          phase,
          winnerName,
          winnerCrownRef.current,
          koExplosionRef.current,
          hitEffectRef.current,
          energyOrbRef.current,
          fightTextRef.current,
          roundBannerRef.current,
          koTextRef.current,
          victoryTextRef.current,
        );
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [battle, audienceMembers, phase, winnerName]);

  useEffect(() => startLoop(), [startLoop]);

  useEffect(() => {
    if (!battle || !playbackActive) {
      return;
    }

    const currentEvent = battle.events[playhead];
    const nextEvent = battle.events[playhead + 1];
    const delay = Math.max(700, (nextEvent?.atMs ?? currentEvent.atMs + 1000) - currentEvent.atMs);
    const timer = window.setTimeout(() => {
      setPlayhead((current) => Math.min(current + 1, battle.events.length - 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [battle, playbackActive, playhead]);

  // Fire-and-forget SecondMe training ingestion when battle completes
  useEffect(() => {
    if (!battle || !reachedEnd) return;
    void fetch("/api/arena/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battleId: battle.id }),
    }).catch(() => null);
  }, [battle, reachedEnd]);

  const startRecording = () => {
    if (!canvasRef.current || !canRecord) {
      return;
    }

    const stream = canvasRef.current.captureStream(30);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((item) => MediaRecorder.isTypeSupported(item));
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType ?? "video/webm",
      });
      const nextUrl = URL.createObjectURL(blob);
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      setDownloadUrl(nextUrl);
      setRecording(false);
    };

    recorder.start();
    recorderRef.current = recorder;
    setPlayhead(0);
    setIsPlaying(true);
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const handleVote = async (side: "player" | "defender") => {
    if (!battle || votePending) return;
    setVotePending(true);
    try {
      const res = await fetch("/api/arena/vote", {
        body: JSON.stringify({ battleId: battle.id, side }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; player: number; defender: number };
        setVotes({ player: data.player, defender: data.defender });
      }
    } finally {
      setVotePending(false);
    }
  };

  const handleRematch = async () => {
    if (!battle) {
      return;
    }

    setRematchPending(true);
    try {
      const payload = await fetch("/api/arena/rematch", {
        body: JSON.stringify({ battleId: battle.id }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!payload.ok) {
        throw new Error("创建 rematch 失败");
      }

      const data = (await payload.json()) as RematchResponse;
      router.push(`/arena?setupId=${data.setup.id}`);
    } finally {
      setRematchPending(false);
    }
  };

  if (error) {
    return (
      <main className="scanlines min-h-screen px-4 py-6" style={{ color: 'var(--text)' }}>
        <div className="mk-panel mx-auto max-w-3xl p-8 mk-status">
          {error}
        </div>
      </main>
    );
  }

  if (!battle || !replayState) {
    return (
      <main className="scanlines min-h-screen px-4 py-6" style={{ color: 'var(--text)' }}>
        <div className="mk-panel mx-auto max-w-3xl p-8 mk-status">
          正在载入战斗包...
        </div>
      </main>
    );
  }

  return (
    <main className="scanlines relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10" style={{ color: 'var(--text)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">

        {/* ── HUD HEADER ── */}
        <section className="entry-fade mk-panel px-6 py-5 sm:px-8">
          {/* Fighter HP bars */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red-bright)', textShadow: '0 0 8px rgba(255,30,0,0.5)' }}>
                  {battle.player.displayName}
                </p>
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--red)' }}>
                  {replayState.playerHealth}%
                </p>
              </div>
              <HealthBar value={replayState.playerHealth} />
            </div>

            <div className="flex flex-col items-center gap-1 px-3">
              <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                第 {replayState.round} 回合
              </p>
              <span className="mk-vs" style={{ fontSize: '1.6rem' }}>VS</span>
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--gold)' }}>
                  {replayState.defenderHealth}%
                </p>
                <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold-bright)', textShadow: '0 0 8px rgba(255,215,0,0.4)', textAlign: 'right' }}>
                  {battle.defender.displayName}
                </p>
              </div>
              <HealthBar value={replayState.defenderHealth} gold />
            </div>
          </div>

          <hr className="mk-divider mb-4" />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mk-badge mb-2">实时战斗回放</div>
              <h1 className="mk-section">{battle.roomTitle}</h1>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: '6px' }}>
                {battle.topic.prompt}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="mk-button-ghost px-4 py-3"
                onClick={() => setIsPlaying((current) => !current)}
                type="button"
              >
                {playbackActive ? "暂停回放" : "继续回放"}
              </button>
              <button
                className="mk-button px-4 py-3"
                disabled={goLivePending}
                onClick={() => {
                  setGoLivePending(true);
                  void fetch("/api/arena/live", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ battleId: battle.id, delaySeconds: 5 }),
                  })
                    .then((res) => res.ok ? res.json() : null)
                    .then((data: { startAt: string } | null) => {
                      if (data?.startAt) setLiveStartAt(data.startAt);
                    })
                    .catch(() => null)
                    .finally(() => setGoLivePending(false));
                }}
                type="button"
                style={{ background: liveStartAt ? 'var(--gold-dim)' : undefined }}
              >
                {goLivePending ? "设置中..." : liveStartAt ? "已开播 ✓" : "Go Live"}
              </button>
              <button className="soft-button rounded-full border border-[var(--line)] bg-white/70 px-4 py-3 text-sm" disabled={rematchPending} onClick={() => void handleRematch()} type="button">
                {rematchPending ? "创建中..." : "以此为模板重开"}
              </button>
              {!recording ? (
                <button
                  className="mk-button px-4 py-3"
                  disabled={!canRecord}
                  onClick={startRecording}
                  type="button"
                >
                  {canRecord ? "录制 WebM" : "不支持录制"}
                </button>
              ) : (
                <button
                  className="mk-button-ghost px-4 py-3"
                  onClick={stopRecording}
                  type="button"
                >
                  停止录制
                </button>
              )}
              {downloadUrl ? (
                <a
                  className="mk-button-ghost px-4 py-3"
                  download={`${battle.roomTitle}.webm`}
                  href={downloadUrl}
                >
                  下载录屏
                </a>
              ) : null}
              <Link className="mk-button px-4 py-3" href="/arena" style={{ fontSize: '0.88rem', letterSpacing: '0.2em' }}>
                ⚔ 重赛
              </Link>
              <ShareButton battleId={battle.id} />
            </div>
          </div>
        </section>

        {/* ── CANVAS + SIDEBAR ── */}
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

          {/* Canvas */}
          <article className="entry-fade mk-panel p-4">
            <canvas
              className="w-full"
              height={720}
              ref={canvasRef}
              style={{ display: 'block', background: '#030008', borderTop: '2px solid var(--red)' }}
              width={1280}
            />
            <div className="mt-4 px-1">
              <input
                className="w-full"
                max={battle.events.length - 1}
                min={0}
                onChange={(event) => {
                  setPlayhead(Number(event.target.value));
                  setIsPlaying(false);
                }}
                style={{ accentColor: 'var(--red)', cursor: 'pointer' }}
                type="range"
                value={playhead}
              />
            </div>
            {/* Score display */}
            <div className="flex justify-between mt-2 px-1">
              <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>
                {battle.player.displayName} · {replayState.playerScore}
              </p>
              <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                {replayState.defenderScore} · {battle.defender.displayName}
              </p>
            </div>
          </article>

          {/* Sidebar */}
          <div className="flex flex-col gap-5">

            {/* Competition results */}
            {battle.competition ? (
              <article className="entry-fade mk-panel p-5">
                <div className="mk-label-red mb-2">排位结算</div>
                <h2 className="mk-section mb-4">{battle.competition.stakesLabel}</h2>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '2.1' }}>
                  <p>
                    获胜：<span style={{ color: 'var(--gold)' }}>{winnerCompetition?.displayName ?? "胜者"}</span>{" "}
                    <span style={{ color: 'var(--gold-bright)' }}>{formatScoreDelta(winnerCompetition)}</span>
                  </p>
                  <p>
                    失利：<span style={{ color: 'var(--red)' }}>{loserCompetition?.displayName ?? "败者"}</span>{" "}
                    <span style={{ color: 'var(--red)' }}>{formatScoreDelta(loserCompetition)}</span>
                  </p>
                  <p>
                    排名：{winnerCompetition?.rankBefore ?? "-"} → <span style={{ color: 'var(--gold)' }}>{winnerCompetition?.rankAfter ?? "-"}</span>
                  </p>
                  <p>
                    连胜：{winnerCompetition?.streakBefore ?? 0} → <span style={{ color: 'var(--gold-bright)' }}>{winnerCompetition?.streakAfter ?? 0}</span>
                  </p>
                  {battle.competition.endedOpponentStreak ? (
                    <p style={{ color: 'var(--red)', marginTop: '4px' }}>
                      终结对手 {battle.competition.endedOpponentStreakCount} 连胜。
                    </p>
                  ) : null}
                  {battle.competition.isUpsetWin ? (
                    <p style={{ color: 'var(--gold-bright)', marginTop: '4px' }}>⚡ 下克上胜利</p>
                  ) : null}
                  {(battle.setupId ?? battle.sourceMeta?.setupId) ? (
                    <p style={{ marginTop: '4px' }}>配置 ID：{battle.setupId ?? battle.sourceMeta?.setupId}</p>
                  ) : null}
                  {(battle.originBattleId ?? battle.sourceMeta?.originBattleId) ? (
                    <p>来源对局：{battle.originBattleId ?? battle.sourceMeta?.originBattleId}</p>
                  ) : null}
                </div>
              </article>
            ) : null}

            {/* Current event */}
            <article className="entry-fade mk-panel p-5">
              <div className="mk-label-red mb-2">战斗解释</div>
              <h2 className="mk-section mb-3">
                {replayState.currentEvent?.title ?? "等待战斗开始"}
              </h2>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
                {replayState.currentEvent?.description}
              </p>
              {(replayState.currentEvent?.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {(replayState.currentEvent?.tags ?? []).map((tag) => (
                    <span key={tag} className="mk-badge">{tag}</span>
                  ))}
                </div>
              )}

              {/* Profile anchors for current actor */}
              {(() => {
                const event = replayState.currentEvent;
                if (!event?.actorId) return null;
                const actor = event.actorId === battle.player.id ? battle.player : event.actorId === battle.defender.id ? battle.defender : null;
                if (!actor) return null;
                const anchors = actor.memoryAnchors.slice(0, 2);
                const summary = actor.identitySummary.slice(0, 2);
                if (!anchors.length && !summary.length) return null;
                const isPlayer = actor === battle.player;
                return (
                  <div className="mk-panel-inset p-3 mt-4">
                    <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: isPlayer ? 'var(--red)' : 'var(--gold)', marginBottom: '8px' }}>
                      {actor.displayName} · 构筑依据
                    </p>
                    {summary.map((s) => (
                      <p key={s} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                        · {s}
                      </p>
                    ))}
                    {anchors.map((a) => (
                      <p key={a} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.6', fontStyle: 'italic' }}>
                        「{a}」
                      </p>
                    ))}
                  </div>
                );
              })()}
            </article>

            {/* Active card + soul for current round */}
            {replayState.round >= 1 && (() => {
              const round = replayState.round;
              const playerCard = battle.player.cards[(round - 1) % battle.player.cards.length];
              const defenderCard = battle.defender.cards[(round + 1) % battle.defender.cards.length];
              if (!playerCard && !defenderCard) return null;
              return (
                <article className="entry-fade mk-panel p-5">
                  <div className="mk-label-red mb-3">本回合装备卡</div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {[{ card: playerCard, fighter: battle.player, isPlayer: true }, { card: defenderCard, fighter: battle.defender, isPlayer: false }].map(({ card, fighter, isPlayer }) => {
                      if (!card) return null;
                      const accent = isPlayer ? 'var(--red)' : 'var(--gold)';
                      return (
                        <div key={fighter.id} style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(60,0,0,0.22)`, borderTop: `2px solid ${accent}`, padding: '8px' }}>
                          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: accent, marginBottom: '4px' }}>
                            {fighter.displayName}
                          </p>
                          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-bright)', marginBottom: '3px' }}>
                            {card.title}
                          </p>
                          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: accent, marginBottom: '6px' }}>
                            {card.trait}
                          </p>
                          <div className="flex flex-col gap-1">
                            <MiniStatBar label="ATK" value={card.atk} max={20} accent="var(--red)" />
                            <MiniStatBar label="DEF" value={card.def} max={20} accent="var(--gold-dim)" />
                            <MiniStatBar label="PEN" value={card.pen} max={18} accent="#7a00cc" />
                            <MiniStatBar label="SPD" value={card.spd} max={18} accent="#006fa8" />
                          </div>
                          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '5px', lineHeight: '1.5' }}>
                            {card.hint}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Soul stats comparison */}
                  <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {[{ fighter: battle.player, isPlayer: true }, { fighter: battle.defender, isPlayer: false }].map(({ fighter, isPlayer }) => (
                      <div key={fighter.id}>
                        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: isPlayer ? 'var(--red)' : 'var(--gold)', marginBottom: '5px' }}>
                          魂核
                        </p>
                        <SoulMiniBlock soul={fighter.soul} accent={isPlayer ? 'var(--red)' : 'var(--gold)'} />
                      </div>
                    ))}
                  </div>
                </article>
              );
            })()}

            {/* Event stream */}
            <article className="entry-fade mk-panel p-5">
              <div className="mk-label-red mb-3">事件流</div>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {battle.events.map((event, index) => (
                  <div
                    key={event.id}
                    className={index === playhead ? "mk-event-item mk-event-item-active" : "mk-event-item"}
                  >
                    <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: index === playhead ? 'var(--red-bright)' : 'var(--text)', marginBottom: '3px' }}>
                      {event.title}
                    </p>
                    <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      {event.description}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        {/* ── HIGHLIGHTS + RESULTS ── */}
        <section className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">

          {/* Highlights + judges */}
          <article className="entry-fade mk-panel p-6">
            <div className="mk-label-red mb-2">战斗战报</div>
            <h2 className="mk-section mb-5">三大高光</h2>
            <div className="flex flex-col gap-4">
              {battle.highlights.map((highlight) => (
                <article key={highlight.id} className="mk-highlight">
                  <div className="mk-badge mb-2">{highlight.label}</div>
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.95rem', color: 'var(--text-bright)', marginBottom: '6px' }}>
                    {highlight.title}
                  </p>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.75' }}>
                    {highlight.description}
                  </p>
                </article>
              ))}
            </div>

            <hr className="mk-divider my-5" />

            <div className="grid gap-3 md:grid-cols-3">
              {battle.judges.map((judge) => (
                <div key={judge.id} className="mk-panel-inset p-3">
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
                    {judge.title}
                  </p>
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1.1rem', color: 'var(--text-bright)', marginBottom: '5px' }}>
                    <span style={{ color: 'var(--red)' }}>{judge.playerScore}</span>
                    {" : "}
                    <span style={{ color: 'var(--gold)' }}>{judge.defenderScore}</span>
                  </p>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.65' }}>
                    {judge.commentary}
                  </p>
                </div>
              ))}
            </div>
          </article>

          {/* Final score + next challenge */}
          <div className="flex flex-col gap-5">
            <article className="entry-fade mk-panel p-5">
              <div className="mk-label-red mb-2">终局比分</div>
              <h2 className="mk-section mb-4">{winnerLabel(battle)}</h2>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: '2.1' }}>
                <p>
                  终局总分{" "}
                  <span style={{ color: 'var(--red)', fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1.1rem' }}>{battle.finalScore.player}</span>
                  {" : "}
                  <span style={{ color: 'var(--gold)', fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1.1rem' }}>{battle.finalScore.defender}</span>
                </p>
                <p>
                  观众热度{" "}
                  <span style={{ color: 'var(--red)' }}>{battle.crowdScore.player}</span>
                  {" : "}
                  <span style={{ color: 'var(--gold)' }}>{battle.crowdScore.defender}</span>
                </p>
              </div>
            </article>

            <article className="entry-fade mk-panel p-5">
              <div className="mk-label-red mb-3">观众投票</div>
              <div className="flex gap-2 mb-3">
                <button
                  className="mk-button px-3 py-2 flex-1"
                  disabled={votePending}
                  onClick={() => void handleVote("player")}
                  style={{ fontSize: '0.78rem', background: 'rgba(180,0,0,0.18)', borderColor: 'var(--red)' }}
                  type="button"
                >
                  <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--red-bright)', fontSize: '0.85rem' }}>
                    {battle.player.displayName}
                  </span>
                  <br />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{votes.player} 票</span>
                </button>
                <button
                  className="mk-button px-3 py-2 flex-1"
                  disabled={votePending}
                  onClick={() => void handleVote("defender")}
                  style={{ fontSize: '0.78rem', background: 'rgba(180,140,0,0.12)', borderColor: 'var(--gold)' }}
                  type="button"
                >
                  <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', fontSize: '0.85rem' }}>
                    {battle.defender.displayName}
                  </span>
                  <br />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{votes.defender} 票</span>
                </button>
              </div>
              {(votes.player + votes.defender) > 0 && (
                <div style={{ height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
                  <div style={{ width: `${Math.round(votes.player / (votes.player + votes.defender) * 100)}%`, background: 'var(--red)', transition: 'width 0.4s ease' }} />
                  <div style={{ flex: 1, background: 'var(--gold)', opacity: 0.75 }} />
                </div>
              )}
              {(votes.player + votes.defender) === 0 && (
                <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }} />
              )}
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
                共 {votes.player + votes.defender} 票
              </p>
            </article>

            <article className="entry-fade mk-panel p-5">
              <div className="mk-label-red mb-2">下一战推荐</div>
              <h2 className="mk-section mb-4">
                {winnerProfile?.suggestion
                  ? `建议挑战 ${winnerProfile.suggestion.displayName}`
                  : `下一位焦点：${battle.challengerPreview.displayName}`}
              </h2>
              {winnerProfile?.suggestion ? (
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '2' }}>
                  <p>{winnerProfile.suggestion.reason}</p>
                  <p>对手积分 <span style={{ color: 'var(--gold)' }}>{winnerProfile.suggestion.rating}</span> · 连胜 {winnerProfile.suggestion.currentStreak}</p>
                  <p>
                    继续胜出预计 <span style={{ color: 'var(--gold)' }}>+{winnerProfile.suggestion.projectedWinDelta}</span>，
                    失利 <span style={{ color: 'var(--red)' }}>{winnerProfile.suggestion.projectedLossDelta}</span>
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.8', marginBottom: '12px' }}>
                    {battle.challengerPreview.declaration}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {formatSoul(battle.challengerPreview.soul).map((stat) => (
                      <span key={stat.key} className="mk-badge">
                        {stat.label} {stat.value}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </article>
          </div>
        </section>

      </div>
    </main>
  );
}
