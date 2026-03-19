import { NextRequest, NextResponse } from "next/server";

import { registerOpenClawBindingWithCode } from "@/lib/openclaw";
import type { OpenClawBindingInput } from "@/lib/arena-types";

type RegisterBody = Omit<
  OpenClawBindingInput,
  "runtimeLabel" | "sourceKind"
> & {
  bindCode?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterBody;

  if (
    !body.bindCode ||
    !body.displayName ||
    !body.declaration ||
    !body.rule ||
    !body.taboo ||
    !body.viewpoints?.length
  ) {
    return NextResponse.json(
      {
        message:
          "bindCode、displayName、declaration、rule、taboo、viewpoints 为必填项",
      },
      { status: 400 },
    );
  }

  try {
    const payload = await registerOpenClawBindingWithCode({
      archetype: body.archetype,
      agentVersion: body.agentVersion,
      aura: body.aura,
      avatarUrl: body.avatarUrl,
      bindCode: body.bindCode,
      declaration: body.declaration,
      displayId: body.displayId,
      displayName: body.displayName,
      memoryAnchors: body.memoryAnchors ?? [],
      rule: body.rule,
      soulSeedTags: body.soulSeedTags ?? [],
      sourceFile: body.sourceFile,
      sourceLabel: body.sourceLabel,
      taboo: body.taboo,
      tags: body.tags ?? [],
      viewpoints: body.viewpoints,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "OpenClaw 注册失败",
      },
      { status: 400 },
    );
  }
}
