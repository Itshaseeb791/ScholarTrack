import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Scholarship Tracker",
    short_name: "ScholarTrack",
    description: "Your personal scholarship and university application tracker.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#F5FAF7",
    background_color: "#F5FAF7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
