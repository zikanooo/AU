import React from 'react';
import { useMusic } from '../context/MusicContext';

/** Latar gelap dengan cahaya lembut dari warna cover (mengikuti --hue). */
export const LiquidMeshBackground: React.FC = () => {
  const { glassSettings, isPlaying } = useMusic();

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" style={{ background: '#0d0b0c' }}>
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background:
            'radial-gradient(120% 50% at 50% -5%, var(--tint-glow) 0%, transparent 70%), linear-gradient(180deg, var(--tint) 0%, #0d0b0c 60%)',
        }}
      />
      {glassSettings.dynamicMesh && (
        <>
          <div
            className="absolute -top-[10%] -right-[18%] w-[70vw] h-[70vw] max-w-[540px] max-h-[540px] rounded-full blur-[120px] opacity-30 animate-blob-1 transition-colors duration-1000"
            style={{
              backgroundColor: 'var(--accent)',
              animationDuration: `${24 / glassSettings.meshSpeed}s`,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          />
          <div
            className="absolute top-[55%] -left-[22%] w-[70vw] h-[70vw] max-w-[560px] max-h-[560px] rounded-full blur-[130px] opacity-[0.14] animate-blob-2 transition-colors duration-1000"
            style={{
              backgroundColor: 'var(--accent)',
              animationDuration: `${28 / glassSettings.meshSpeed}s`,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          />
        </>
      )}
    </div>
  );
};
