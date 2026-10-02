import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "dot / Session Desk",
  description: "dotと会話を分けて相談できる、プライベートなワークスペース。",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
