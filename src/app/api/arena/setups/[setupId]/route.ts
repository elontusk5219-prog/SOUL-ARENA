import { NextResponse } from "next/server";

import { getResolvedBattleSetup } from "@/lib/arena-rematch";

export async function GET(
  _request: Request,
  context: { params: Promise<{ setupId: string }> },
) {
  const { setupId } = await context.params;
  const payload = await getResolvedBattleSetup(setupId);

  if (!payload) {
    return NextResponse.json(
      {
        message: "未找到配置模板",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(payload);
}
