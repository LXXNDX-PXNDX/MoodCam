import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Convertly",
  description: "Supabase + backend file converter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
