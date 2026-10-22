import React from 'react';
import { motion } from 'motion/react';
import { Home, Search, Library } from 'lucide-react';
import { TabType } from '../types/music';
import { useMusic } from '../context/MusicContext';

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }[] = [
  { id: 'home', label: 'Beranda', icon: Home },
  { id: 'search', label: 'Cari', icon: Search },
  { id: 'library', label: 'Pustaka', icon: Library },
];

export const LiquidGlassTabBar: React.FC = () => {
  const { activeTab, setActiveTab, glassSettings } = useMusic();
  if (activeTab === 'profile' || activeTab === 'together') return null;

  const go = (id: TabType) => {
    setActiveTab(id);
    if (glassSettings.hapticFeedback && 'vibrate' in navigator) {
      try { navigator.vibrate(8); } catch {}
    }
  };

  return (
    <nav className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none" aria-label="Navigasi utama">
      <div className="pointer-events-auto relative flex w-full max-w-[440px] p-1.5 rounded-full glass-pill">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className="relative flex-1 h-[54px] flex flex-col items-center justify-center rounded-full focus-visible:outline-none"
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-accent/20 border border-accent/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} className={`relative transition-colors ${active ? 'text-accent' : 'text-[#d6cdcf]'}`} />
              <span className={`relative text-[11px] mt-0.5 font-medium transition-colors ${active ? 'text-accent' : 'text-[#c9bfc2]'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
