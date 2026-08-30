import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "LeadScout — Find leads ready for outreach",
  description:
    "Pick a niche and state. Get contacts, pain points, and pitch angles you can send today. Start free with 50 leads.",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#141414",
          colorBackground: "#ffffff",
          colorForeground: "#141414",
          colorInput: "#ffffff",
          colorInputForeground: "#141414",
        },
      }}
    >
      <html lang="en" className={`${dmSans.variable} ${sora.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
