import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MusicProvider, useMusic } from './context/MusicContext';
import { LiquidMeshBackground } from './components/LiquidMeshBackground';
import { LiquidGlassTabBar } from './components/LiquidGlassTabBar';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { TogetherPage } from './pages/TogetherPage';
import { DynamicTheme } from './components/DynamicTheme';
import { CheckCircle2 } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeTab, currentSong, toastMessage, glassSettings } = useMusic();

  return (
    <div className="relative min-h-screen text-[#f4eceb] flex flex-col items-center overflow-x-hidden">
      {/* Dynamic Ambient Liquid Mesh Background */}
      <DynamicTheme />
      <LiquidMeshBackground />

      {/* Floating Liquid Glass Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            className="fixed top-5 z-50 pointer-events-none px-4"
          >
            <div className="px-4 py-2 rounded-2xl glass-pill specular-border flex items-center gap-2.5 text-xs font-semibold text-white">
              <CheckCircle2 size={15} className="text-accent shrink-0" />
              <span>{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area with Spring Transitions */}
      <main className={`relative z-10 w-full ${glassSettings.landscape ? 'max-w-4xl' : 'max-w-xl'} flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))]`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-full"
          >
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'search' && <SearchPage />}
            {activeTab === 'library' && <LibraryPage />}
            {activeTab === 'profile' && <ProfilePage />}
            {activeTab === 'together' && <TogetherPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Glass Mini Player */}
      <MiniPlayer />

      {/* Floating Liquid Glass Tab Bar with Draggable Refraction Bubble */}
      <LiquidGlassTabBar />

      {/* Fullscreen Modal Player with Synchronized Lyrics & Queue */}
      <FullPlayer />
    </div>
  );
};

export default function App() {
  return (
    <MusicProvider>
      <MainLayout />
    </MusicProvider>
  );
}
