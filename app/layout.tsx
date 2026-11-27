import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BBFF — Coming Soon',
  description: 'Something strong is being built, one log at a time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
