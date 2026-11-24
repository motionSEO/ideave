import type { Metadata } from "next";
import "./globals.css";
import "./theme-dark.css";
import { IDEAVE_CURSOR_STYLES } from "../components/reference-prototype/ideaveCursor";

export const metadata: Metadata = {
  title: "IDEAVE",
  description: "Design reference curation with AI-powered exploration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 저장된 화면 모드를 그리기 전에 적용해 화이트→다크 깜빡임을 막는다 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('ideave.theme')==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}",
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: IDEAVE_CURSOR_STYLES }} />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
