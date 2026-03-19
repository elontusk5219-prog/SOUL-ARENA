import { NextRequest, NextResponse } from "next/server";

import { createRematchSetupFromBattle } from "@/lib/arena-rematch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    battleId?: string;
  };

  if (!body.battleId) {
    return NextResponse.json(
      {
        message: "缺少 battleId",
      },
      { status: 400 },
    );
  }

  const setup = createRematchSetupFromBattle(body.battleId);

  if (!setup) {
    return NextResponse.json(
      {
        message: "未找到对战记录",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    setup,
  });
}
