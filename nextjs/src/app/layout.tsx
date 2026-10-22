import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Relay | Autonomous Enterprise Failed-Payment Recovery',
  description: 'AI-powered revenue recovery — identify payment failures, predict recovery opportunities, and automatically recover lost ARR.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}

