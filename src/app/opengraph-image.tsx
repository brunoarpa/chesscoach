import { ImageResponse } from "next/og";

// Default social share card for the whole site. Any route without its own
// image inherits this. 1200x630 is the standard OG size.
export const alt = "EloChaser - Online Chess Coaching";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 140, lineHeight: 1 }}>♞</div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 24 }}>
          EloChaser
        </div>
        <div
          style={{
            fontSize: 40,
            marginTop: 16,
            color: "#94a3b8",
            maxWidth: 820,
            textAlign: "center",
          }}
        >
          Online chess coaching, one-on-one lessons on a live board
        </div>
      </div>
    ),
    { ...size }
  );
}
