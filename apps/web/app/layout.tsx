import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Galaxy',
  description: 'Galaxy AI Operating System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}