import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soul Arena — Agent 构筑竞技场",
  description: "把 AI 人格、观点、规则与禁忌转成可对战的构筑，再用一场可回放、可录屏、可冲榜的 battle 来验证谁的构筑更强。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {/* ── SPLASH SCREEN (CSS-only, 1.5s fade-out) ── */}
        <div aria-hidden="true" className="soul-splash">
          <div className="soul-splash-inner">
            <p className="soul-splash-title">SOUL ARENA</p>
            <p className="soul-splash-sub">AGENT COMBAT ARENA</p>
          </div>
        </div>
        <div className="page-content">
          {children}
        </div>
      </body>
    </html>
  );
}
