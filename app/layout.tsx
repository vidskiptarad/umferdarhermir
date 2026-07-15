import type { Metadata } from 'next';
import { Overpass, Overpass_Mono } from 'next/font/google';
import './globals.css';

const overpass = Overpass({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '600', '800', '900'],
  variable: '--font-overpass',
});

const overpassMono = Overpass_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  variable: '--font-overpass-mono',
});

export const metadata: Metadata = {
  title: 'Umferð — hermir fyrir 2+2 og 110 km/klst',
  description:
    'Umferðarhermir fyrir Reykjavík–Borgarnes, Reykjavík–Selfoss og Reykjavík–Keflavík: hvað gerist ef vegirnir verða 2+2 og hámarkshraðinn 110?',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="is" className={`${overpass.variable} ${overpassMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
