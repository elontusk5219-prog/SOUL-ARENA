import { NextRequest, NextResponse } from "next/server";

const DEER_API_URL = "https://api.deerapi.com/v1/chat/completions";
const MODEL = "gemini-2.5-flash-image";

type SpriteRequest = {
  name: string;
  tags: string[];
  slot: "alpha" | "beta";
};

type DeerChoice = {
  message: { content: string };
};

type DeerResponse = {
  choices: DeerChoice[];
  error?: { message: string };
};

function buildPrompt(name: string, tags: string[], slot: "alpha" | "beta"): string {
  const side = slot === "alpha" ? "red energy aura, left side warrior" : "golden energy aura, right side warrior";
  const tagStr = tags.length ? tags.slice(0, 4).join(", ") : "mysterious fighter";
  return [
    `A Mortal Kombat style fighting game character named "${name}".`,
    `Personality: ${tagStr}.`,
    `Full body, dramatic battle stance, dark arena background with ${side},`,
    `cinematic lighting, glowing eyes, detailed warrior costume, no text or watermarks,`,
    `square composition, ultra high quality.`,
  ].join(" ");
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "DEER_API_KEY not configured" }, { status: 500 });
  }

  let body: Partial<SpriteRequest>;
  try {
    body = (await request.json()) as Partial<SpriteRequest>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { name, tags = [], slot = "alpha" } = body;
  if (!name) {
    return NextResponse.json({ message: "Missing name" }, { status: 400 });
  }

  const prompt = buildPrompt(name, tags, slot);

  const deerResponse = await fetch(DEER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!deerResponse.ok) {
    const errText = await deerResponse.text();
    return NextResponse.json({ message: `Deer API error: ${errText}` }, { status: 502 });
  }

  const data = (await deerResponse.json()) as DeerResponse;
  if (data.error) {
    return NextResponse.json({ message: data.error.message }, { status: 502 });
  }

  const content = data.choices[0]?.message?.content ?? "";

  // Extract base64 data URL from markdown image syntax
  const match = content.match(/!\[.*?\]\((data:image\/\w+;base64,[A-Za-z0-9+/=]+)\)/);
  if (!match) {
    // Return a clear error so caller knows no image came back
    return NextResponse.json({ message: "No image returned from model", content }, { status: 502 });
  }

  const dataUrl = match[1];
  return NextResponse.json({ dataUrl });
}
