import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest, NextResponse } from "next/server";

const RECORDINGS_DIR = join(process.cwd(), ".local", "recordings");

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const recording = formData.get("recording");
  const battleId = formData.get("battleId");

  if (!recording || !(recording instanceof Blob)) {
    return NextResponse.json({ message: "recording field (Blob/File) is required" }, { status: 400 });
  }

  mkdirSync(RECORDINGS_DIR, { recursive: true });

  const timestamp = Date.now();
  const baseName =
    typeof battleId === "string" && battleId.trim()
      ? battleId.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : String(timestamp);
  const filename = `${baseName}.webm`;
  const filePath = join(RECORDINGS_DIR, filename);

  const arrayBuffer = await recording.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));

  const url = `/api/arena/recordings/${encodeURIComponent(filename)}`;

  return NextResponse.json({ url, filename });
}
