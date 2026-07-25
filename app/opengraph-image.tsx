import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "criblist sf rentals, an open-source project built with Context.dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const cards = [
  { top: 18, left: 86, rotate: "-5deg", accent: "#f6b56f" },
  { top: 126, left: 0, rotate: "4deg", accent: "#a9c9ef" },
  { top: 226, left: 112, rotate: "-2deg", accent: "#bbd9c0" },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "stretch",
          overflow: "hidden",
          background: "#faf9f7",
          color: "#191919",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 700,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "62px 0 56px 68px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 34,
                height: 22,
                display: "flex",
                borderRadius: 12,
                background: "#3164ec",
                boxShadow: "18px 0 0 #83a6ff",
              }}
            />
            <span style={{ fontSize: 25, fontWeight: 700 }}>Context.dev</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                alignSelf: "flex-start",
                display: "flex",
                padding: "9px 18px",
                borderRadius: 999,
                background: "#eef2ff",
                color: "#315fdd",
                fontSize: 22,
              }}
            >
              open source
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 112,
                fontWeight: 700,
                letterSpacing: -6,
                lineHeight: 0.88,
              }}
            >
              criblist
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 73,
                fontWeight: 400,
                letterSpacing: -4,
              }}
            >
              sf rentals
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 24, color: "#56524d" }}>
            the sf hunt, minus the hunting.
          </div>
        </div>

        <div
          style={{
            position: "relative",
            width: 500,
            height: 630,
            display: "flex",
          }}
        >
          {cards.map((card, index) => (
            <div
              key={card.top}
              style={{
                position: "absolute",
                top: card.top,
                left: card.left,
                width: 338,
                height: 286,
                display: "flex",
                flexDirection: "column",
                padding: 13,
                border: "1px solid #dedbd5",
                borderRadius: 28,
                background: "#ffffff",
                boxShadow: "0 18px 50px rgba(42, 38, 32, 0.14)",
                transform: `rotate(${card.rotate})`,
              }}
            >
              <div
                style={{
                  height: 142,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                  padding: "20px 24px 0",
                  overflow: "hidden",
                  borderRadius: 18,
                  background: card.accent,
                }}
              >
                {[86, 112, 76, 102].map((height, buildingIndex) => (
                  <div
                    key={height}
                    style={{
                      width: 56,
                      height,
                      display: "flex",
                      borderRadius: "6px 6px 0 0",
                      background:
                        buildingIndex % 2 === 0 ? "#fff8eb" : "#f3eee5",
                      border: "2px solid rgba(64, 55, 45, 0.14)",
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  height: 18,
                  width: index === 1 ? 196 : 232,
                  display: "flex",
                  marginTop: 18,
                  borderRadius: 9,
                  background: "#292725",
                }}
              />
              <div
                style={{
                  height: 11,
                  width: 156,
                  display: "flex",
                  marginTop: 12,
                  borderRadius: 6,
                  background: "#d8d4ce",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 22,
                }}
              >
                <div
                  style={{
                    width: 138,
                    height: 36,
                    display: "flex",
                    border: "1px solid #d8d4ce",
                    borderRadius: 18,
                  }}
                />
                <div
                  style={{
                    width: 138,
                    height: 36,
                    display: "flex",
                    borderRadius: 18,
                    background: "#ef4438",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
