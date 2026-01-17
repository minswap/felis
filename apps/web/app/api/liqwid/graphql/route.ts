import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch("https://v2.api.preview.liqwid.dev/graphql", {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        "X-App-Source": "liqwid-app",
        "X-Request-Id": `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Liqwid API error: ${response.status} ${response.statusText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Liqwid GraphQL proxy error:", error);
    return NextResponse.json({ error: "Failed to proxy request to Liqwid API" }, { status: 500 });
  }
}
