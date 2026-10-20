import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const studioSans = localFont({
  src: "./fonts/Inter-Variable.ttf",
  variable: "--font-studio-sans",
  weight: "100 900",
  display: "swap",
});
const studioSerif = localFont({
  src: "./fonts/DMSerifDisplay-Regular.ttf",
  variable: "--font-studio-serif",
  weight: "400",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Trace · Evidence before estimates",
  description:
    "An IFC model review desk. Inspect source quantities, surface cost gaps, and understand the impact of a revision.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${studioSans.variable} ${studioSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
