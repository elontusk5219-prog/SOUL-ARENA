"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type AudienceMember = {
  id: string;
  displayName: string;
  displayId: string | null;
  avatarDataUrl: string | null;
  createdAt: string;
};

type AudienceResponse = {
  members: AudienceMember[];
};

type JoinResponse = {
  member: AudienceMember;
};

function AudienceAvatar({ member }: { member: AudienceMember }) {
  return (
    <div
      title={member.displayName}
      style={{
        width: 42,
        height: 42,
        borderRadius: "50%",
        border: "1px solid rgba(200,0,0,0.5)",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "conic-gradient(var(--red-dark) 0deg, var(--red-bright) 180deg, var(--red-dark) 360deg)",
        boxShadow: "0 0 8px rgba(200,0,0,0.3)",
      }}
    >
      {member.avatarDataUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={member.avatarDataUrl}
          alt={member.displayName}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "1rem",
          color: "var(--text-bright)",
          textTransform: "uppercase",
        }}>
          {member.displayName.charAt(0)}
        </span>
      )}
    </div>
  );
}

export default function WatchPage() {
  const [displayName, setDisplayName] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [joinedMember, setJoinedMember] = useState<AudienceMember | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceMembers, setAudienceMembers] = useState<AudienceMember[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAudience = () => {
    void fetch("/api/arena/audience", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AudienceResponse | null) => {
        if (data?.members) {
          setAudienceCount(data.members.length);
          setAudienceMembers(data.members.slice(0, 12));
        }
      })
      .catch(() => null);
  };

  useEffect(() => {
    fetchAudience();
    const interval = setInterval(fetchAudience, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleJoin = async () => {
    if (!displayName.trim()) {
      setError("请输入你的显示名称。");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/arena/audience", {
        body: JSON.stringify({
          displayName: displayName.trim(),
          displayId: displayId.trim() || undefined,
          avatarDataUrl: avatarDataUrl ?? undefined,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "入场失败");
      }
      const data = (await res.json()) as JoinResponse;
      if (data.member) {
        setJoined(true);
        setJoinedMember(data.member);
        setAudienceCount((prev) => (prev ?? 0) + 1);
        fetchAudience();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "入场失败，请重试。");
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      className="scanlines page-content relative min-h-screen overflow-hidden"
      style={{
        color: "var(--text)",
        backgroundImage: `
          url('/watch-bg.png'),
          radial-gradient(ellipse at 50% 0%, rgba(139,0,0,0.4) 0%, transparent 60%),
          linear-gradient(180deg, #060008 0%, #0a0010 60%, #050007 100%)
        `,
        backgroundSize: "cover, auto, auto",
        backgroundPosition: "center center, center, center",
        backgroundBlendMode: "overlay, normal, normal",
      }}
    >
      {/* Dark overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(3,0,6,0.82)", pointerEvents: "none" }} aria-hidden="true" />

      <div className="relative mx-auto flex max-w-lg flex-col gap-6 px-4 py-10 sm:px-6">

        {/* ── ENTER THE ARENA HEADER ── */}
        <div className="text-center entry-fade">
          <div style={{
            fontFamily: "Impact, Arial Black, sans-serif",
            fontSize: "0.6rem",
            letterSpacing: "0.5em",
            color: "var(--red)",
            textTransform: "uppercase",
            marginBottom: "10px",
          }}>
            — 观战入口 —
          </div>
          <h1
            className="mk-title mk-title-anim"
            style={{ fontSize: "clamp(2.5rem, 10vw, 5rem)", marginBottom: "14px" }}
          >
            ENTER THE ARENA
          </h1>
          {/* Souls watching */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(200,0,0,0.4)",
            padding: "8px 20px",
          }}>
            <span className="live-dot" />
            <span style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "1rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--gold-bright)",
            }}>
              {audienceCount !== null ? (
                <span className="souls-watching-count">{audienceCount}</span>
              ) : (
                "—"
              )}{" "}
              SOULS WATCHING
            </span>
          </div>
        </div>

        {/* ── CROWD PREVIEW ── */}
        {audienceMembers.length > 0 && (
          <div className="entry-fade" style={{
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(80,0,0,0.35)",
            padding: "12px 16px",
          }}>
            <p style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "0.58rem",
              letterSpacing: "0.35em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}>
              CROWD PREVIEW
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {audienceMembers.map((m) => (
                <AudienceAvatar key={m.id} member={m} />
              ))}
              {(audienceCount ?? 0) > audienceMembers.length && (
                <div style={{
                  width: 42, height: 42, borderRadius: "50%",
                  border: "1px solid rgba(120,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.6)",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "0.65rem",
                  color: "var(--text-muted)",
                }}>
                  +{(audienceCount ?? 0) - audienceMembers.length}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── JOIN FORM or SUCCESS ── */}
        {joined ? (
          <article className="entry-fade mk-panel p-8 flex flex-col gap-5 items-center text-center">
            {/* SEAT ASSIGNED stamp */}
            <div className="stamp-animation" style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "clamp(1.2rem, 4vw, 1.8rem)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--gold-bright)",
              border: "3px solid var(--gold-bright)",
              padding: "12px 28px",
              textShadow: "0 0 20px rgba(255,215,0,0.5)",
              boxShadow: "0 0 24px rgba(255,215,0,0.25), inset 0 0 20px rgba(255,215,0,0.06)",
            }}>
              SEAT ASSIGNED
            </div>

            {/* Avatar preview */}
            {joinedMember && (
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                border: "3px solid var(--gold-bright)",
                overflow: "hidden",
                boxShadow: "0 0 20px rgba(255,215,0,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "conic-gradient(var(--red-dark) 0deg, var(--red-bright) 180deg, var(--red-dark) 360deg)",
              }}>
                {joinedMember.avatarDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={joinedMember.avatarDataUrl} alt="你的头像" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontFamily: "Impact", fontSize: "1.8rem", color: "var(--text-bright)", textTransform: "uppercase" }}>
                    {joinedMember.displayName.charAt(0)}
                  </span>
                )}
              </div>
            )}

            <div>
              <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "1rem", letterSpacing: "0.1em", color: "var(--text-bright)", textTransform: "uppercase" }}>
                {joinedMember?.displayName}
              </p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: "1.8", marginTop: "8px" }}>
                你的灵魂已出现在竞技场观众席中。前往回放页面即可看到自己的头像。
              </p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <Link className="mk-button px-6 py-3" href="/arena">进入竞技场</Link>
              <Link className="mk-button-ghost px-5 py-3" href="/arena/history">查看战绩</Link>
            </div>
          </article>
        ) : (
          <article className="entry-fade mk-panel p-7 flex flex-col gap-5">
            <div>
              <div className="mk-label-red mb-2">CHOOSE YOUR FACE</div>
              <h2 className="mk-section">加入观众席</h2>
            </div>

            {/* Display name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="displayName"
                style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--red)" }}
              >
                战场代号 <span style={{ color: "var(--red-bright)" }}>*</span>
              </label>
              <input
                className="mk-input"
                id="displayName"
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="你的灵魂之名"
                type="text"
                value={displayName}
              />
            </div>

            {/* Display ID (optional) */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="displayId"
                style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--text-muted)" }}
              >
                显示 ID <span style={{ color: "var(--text-muted)", fontSize: "0.55rem" }}>（可选）</span>
              </label>
              <input
                className="mk-input"
                id="displayId"
                onChange={(e) => setDisplayId(e.target.value)}
                placeholder="例如：#0042"
                type="text"
                value={displayId}
              />
            </div>

            {/* Avatar upload — CHOOSE YOUR FACE */}
            <div className="flex flex-col gap-3">
              <label
                style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--text-muted)" }}
              >
                头像 <span style={{ color: "var(--text-muted)", fontSize: "0.55rem" }}>（可选）</span>
              </label>
              <div className="flex items-center gap-4">
                {avatarDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt="头像预览"
                    src={avatarDataUrl}
                    style={{
                      border: "2px solid var(--gold-bright)",
                      borderRadius: "50%",
                      height: "56px",
                      objectFit: "cover",
                      width: "56px",
                      boxShadow: "0 0 14px rgba(255,215,0,0.35)",
                    }}
                  />
                ) : (
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    border: "2px dashed rgba(120,0,0,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-muted)", fontSize: "1.4rem",
                  }}>
                    👤
                  </div>
                )}
                <button
                  className="mk-button-ghost px-4 py-2"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: "0.75rem" }}
                  type="button"
                >
                  {avatarDataUrl ? "更换头像" : "上传头像"}
                </button>
                <input
                  accept="image/*"
                  onChange={handleAvatarChange}
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  type="file"
                />
              </div>
            </div>

            {error && (
              <div className="mk-status" style={{ color: "var(--red-bright)", borderColor: "var(--red)", fontSize: "0.82rem" }}>
                {error}
              </div>
            )}

            {/* ENTER ARENA button */}
            <button
              className="mk-button press-start px-6 py-4"
              disabled={pending || !displayName.trim()}
              onClick={() => void handleJoin()}
              style={{
                fontSize: "0.95rem",
                letterSpacing: "0.2em",
                marginTop: "8px",
                opacity: pending ? 0.7 : 1,
              }}
              type="button"
            >
              {pending ? "正在入场..." : "⚔️ ENTER ARENA"}
            </button>
          </article>
        )}

        {/* Back link */}
        <div className="text-center">
          <Link
            className="mk-button-ghost px-4 py-2"
            href="/"
            style={{ fontSize: "0.75rem" }}
          >
            ← 返回首页
          </Link>
        </div>

      </div>
    </main>
  );
}
