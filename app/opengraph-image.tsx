import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "criblist — the sf hunt, minus the hunting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #fcfbfa 0%, #f5f1ed 100%)",
          color: "#201e1b",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -4 }}>
            criblist
          </span>
          <span style={{ fontSize: 72 }}>🌉</span>
        </div>
        <div style={{ fontSize: 34, color: "#7d7871", marginTop: 18 }}>
          the sf hunt, minus the hunting.
        </div>
      </div>
    ),
    size,
  );
}
