import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Trace · Evidence before estimates",
  description:
    "An IFC model review desk. Inspect source quantities, surface cost gaps, and understand the impact of a revision.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
