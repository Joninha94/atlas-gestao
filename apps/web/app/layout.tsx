import './globals.css';
import type { ReactNode } from 'react';
import { Shell } from '../components/Shell';

export const metadata = { title: 'Produtiva Gestão', description: 'Gestão do escritório de contabilidade em um só lugar' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
