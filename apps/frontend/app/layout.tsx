import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: 'Cushion',
  description: 'Cushion workspace environment',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="light" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
