import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "criblist sf rentals — an open-source project built with Context.dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const cover = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "crib-cover.png"),
).toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "#faf9f7",
        }}
      >
        <img
          alt=""
          src={cover}
          width={1061}
          height={630}
          style={{
            width: 1061,
            height: 630,
            objectFit: "contain",
          }}
        />
      </div>
    ),
    size,
  );
}
