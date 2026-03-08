import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AM Collective — Building AI Infrastructure";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0F1523",
          padding: "72px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Top bar accent */}
        <div
          style={{
            display: "flex",
            width: "64px",
            height: "4px",
            backgroundColor: "#2A52BE",
          }}
        />

        {/* Center content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Monogram */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "72px",
              height: "72px",
              backgroundColor: "#2A52BE",
              color: "#FFFFFF",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            AM
          </div>

          {/* Headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontSize: "64px",
                fontWeight: 700,
                color: "#FFFFFF",
                lineHeight: 1.05,
                letterSpacing: "-2px",
              }}
            >
              AM Collective
            </div>
            <div
              style={{
                fontSize: "64px",
                fontWeight: 700,
                color: "#FFFFFF",
                lineHeight: 1.05,
                letterSpacing: "-2px",
                opacity: 0.5,
              }}
            >
              Capital
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: "24px",
              color: "#8B92A5",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginTop: "8px",
            }}
          >
            Building AI Infrastructure
          </div>
        </div>

        {/* Bottom: domain */}
        <div
          style={{
            fontSize: "18px",
            color: "#3D4556",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          amcollectivecapital.com
        </div>
      </div>
    ),
    { ...size }
  );
}
