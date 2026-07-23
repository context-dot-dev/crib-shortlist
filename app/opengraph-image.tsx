import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "criblist — live san francisco apartments in one clean swipe deck";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const background = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "og-background.png"),
).toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#f7f1e8",
          color: "#2f2b27",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <img
          alt=""
          src={background}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 58,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            criblist
          </span>
          <span style={{ fontSize: 31 }}>🌉</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 178,
            width: 590,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 72,
              lineHeight: 0.98,
              fontWeight: 700,
              letterSpacing: -4.5,
            }}
          >
            <span>the sf hunt,</span>
            <span>minus the hunting.</span>
          </div>

          <div
            style={{
              marginTop: 30,
              fontSize: 25,
              lineHeight: 1.25,
              color: "#6d665f",
              maxWidth: 490,
            }}
          >
            live apartments, ranked and ready to swipe.
          </div>

          <div
            style={{
              marginTop: 34,
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              padding: "13px 20px",
              borderRadius: 999,
              background: "#d25436",
              color: "#fffaf4",
              fontSize: 20,
              fontWeight: 600,
              boxShadow: "0 8px 24px rgba(121, 54, 36, 0.18)",
            }}
          >
            build your deck →
          </div>

          <div
            style={{
              marginTop: 22,
              display: "flex",
              alignItems: "center",
              color: "#2d63e2",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            powered by context.dev
          </div>
        </div>

      </div>
    ),
    size,
  );
}
