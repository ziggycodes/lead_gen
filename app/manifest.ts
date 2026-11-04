import type { MetadataRoute } from "next";

// Lets the app be added to a home screen, which iOS requires before it allows web push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeadScout",
    short_name: "LeadScout",
    description: "Find leads ready for outreach and manage them in your own CRM.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FFFBF2",
    theme_color: "#1C1914",
    icons: [
      { src: "/logo-120.png", sizes: "120x120", type: "image/png" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
