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
    "Pick a niche and state. Get contacts and manage every lead in your own CRM. Start free with 50 leads.",
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
          colorPrimary: "#1C1914",
          colorBackground: "#FFFBF2",
          colorForeground: "#1C1914",
          colorInput: "#FFFBF2",
          colorInputForeground: "#1C1914",
        },
      }}
    >
      <html lang="en" className={`${dmSans.variable} ${sora.variable}`} suppressHydrationWarning>
        <body className="font-sans antialiased" suppressHydrationWarning>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
