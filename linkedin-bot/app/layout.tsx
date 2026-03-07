import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// 1. Configure the Poppins font
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"], // Bring in the weights we need
  variable: "--font-poppins", // Create a CSS variable for Tailwind
});

export const metadata: Metadata = {
  title: "LinkedIn Auto Uploader",
  description: "Serverless developer content engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 2. Apply the font variable and standard Tailwind anti-aliasing to the HTML body
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased bg-neutral-950 text-white`}>
        {children}
      </body>
    </html>
  );
}