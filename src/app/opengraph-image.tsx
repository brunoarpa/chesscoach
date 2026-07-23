import { ImageResponse } from "next/og";

// Default social share card for the whole site. Any route without its own
// image inherits this. 1200x630 is the standard OG size.
export const alt =
  "EloChaser - online chess coaching, one-on-one lessons on a live board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A 4x4 checkerboard drawn with flexbox. We avoid Unicode chess glyphs (e.g.
// the bishop/knight symbols) because satori's default font has no glyph for
// them and renders an empty "tofu" box instead. CSS shapes always render.
function BoardMark() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const dark = (row + col) % 2 === 1;
      cells.push(
        <div
          key={`${row}-${col}`}
          style={{
            width: 44,
            height: 44,
            backgroundColor: dark ? "#334155" : "#e2e8f0",
          }}
        />
      );
    }
  }
  return (
    // Frame lives on an outer wrapper so the inner board stays exactly 176px
    // wide (4 x 44px). A border on the board itself would shrink the content
    // box and make the cells wrap into an uneven grid.
    <div
      style={{
        display: "flex",
        padding: 4,
        backgroundColor: "#475569",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: 176,
          height: 176,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {cells}
      </div>
    </div>
  );
}

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
        <BoardMark />
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 36 }}>
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
