import type { Metadata } from "next";
import { Geist } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ERP Awesomely",
  description: "ERP interno del Grupo Awesomely",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    // suppressHydrationWarning: el script de tema añade la clase `dark` a <html> antes
    // de que React hidrate, así que ese atributo nunca coincide con el del servidor.
    <html lang="es" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-gray-50 text-gray-900">
        <NextTopLoader color="#4f46e5" height={3} showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
