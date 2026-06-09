import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Galaxy — The Operating System for Organizations',
  description:
    'Galaxy gives every team the clarity, coordination, and accountability to operate at their best.',
  openGraph: {
    title: 'Galaxy — The Operating System for Organizations',
    description:
      'Galaxy gives every team the clarity, coordination, and accountability to operate at their best.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="bg-galaxy-black text-galaxy-white antialiased">{children}</body>
    </html>
  );
}
