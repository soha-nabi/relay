import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Issuing Bank ACS · 3D-Secure 2.2 Payment Gateway',
  description: 'Official Tier-1 Issuing Bank Strong Customer Authentication Gateway (HSBC, DBS, HDFC, Chase)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
