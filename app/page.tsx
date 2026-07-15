'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('@/ui/App'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mono text-2xl font-bold tracking-[0.3em]">UMFERÐ</div>
        <div className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
          Hleð hermi…
        </div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
