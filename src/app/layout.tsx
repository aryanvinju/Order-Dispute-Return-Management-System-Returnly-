import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Returnly · Disputes, made clear',
  description: 'A shared workspace for order disputes, evidence and fair resolutions.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
