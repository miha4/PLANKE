import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContentItem } from '@/lib/content-store';
import { getActiveContentItemsAsync, getDefaultImageAsync, isBackendUnavailableError } from '@/lib/content-service';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { getRuntimeConfig } from '@/lib/runtime-config';

const Player = () => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [defaultImage, setDefaultImageState] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressEnabled, setProgressEnabled] = useState(true);
  const [progressColor, setProgressColor] = useState('#3b82f6');
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const progressAnimationRef = useRef<number>();
  const navigate = useNavigate();
  const runtimeDeviceId = getRuntimeConfig().deviceId;

  // Load content and request fullscreen
  useEffect(() => {
    (async () => {
      try {
        if (window.electronApp) {
          const cfg = await window.electronApp.getConfig();
          setProgressEnabled(cfg.progressBarEnabled !== false);
          setProgressColor(cfg.progressBarColor || '#3b82f6');
        } else {
          setProgressEnabled(localStorage.getItem('player-progress-enabled') !== '0');
          setProgressColor(localStorage.getItem('player-progress-color') || '#3b82f6');
        }
        const loadedItems = await getActiveContentItemsAsync();
        setItems(loadedItems);
        setDefaultImageState(await getDefaultImageAsync());
        if (loadedItems.length === 0) setCurrentIndex(-1);
      } catch (error) {
        if (isBackendUnavailableError(error)) {
          toast.error('Backend ni dosegljiv. Zaženi backend in preveri, da je port 8787 forwardan (Codespaces).');
        }
        setItems([]);
        setCurrentIndex(-1);
      }
    })();

    // Request fullscreen
    const el = containerRef.current ?? document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }

    // Periodically refresh active items (every 60s)
    const interval = setInterval(() => {
      getActiveContentItemsAsync()
        .then(fresh => {
          setItems(fresh);
          if (fresh.length === 0) setCurrentIndex(-1);
        })
        .catch(() => {
          setItems([]);
          setCurrentIndex(-1);
        });
    }, 60000);

    return () => {
      clearInterval(interval);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const currentItem = items.length > 0 ? items[currentIndex % items.length] ?? null : null;
  const showDefault = items.length === 0 && defaultImage;

  // Advance to next
  const goNext = useCallback(() => {
    if (items.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % items.length);
  }, [items.length]);

  // Timer for images
  useEffect(() => {
    if (!currentItem || currentItem.type !== 'image') return;
    setProgressPercent(0);
    const totalMs = Math.max(1000, currentItem.displayDurationSeconds * 1000);
    const startTime = performance.now();

    const updateProgress = (now: number) => {
      const elapsed = now - startTime;
      setProgressPercent(Math.min(100, (elapsed / totalMs) * 100));
      progressAnimationRef.current = requestAnimationFrame(updateProgress);
    };

    progressAnimationRef.current = requestAnimationFrame(updateProgress);
    timerRef.current = setTimeout(goNext, currentItem.displayDurationSeconds * 1000);
    return () => {
      clearTimeout(timerRef.current);
      if (progressAnimationRef.current) cancelAnimationFrame(progressAnimationRef.current);
    };
  }, [currentItem, currentIndex, goNext]);

  // Video ended handler
  const handleVideoEnded = useCallback(() => {
    setProgressPercent(100);
    goNext();
  }, [goNext]);

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    setProgressPercent(Math.min(100, (video.currentTime / video.duration) * 100));
  };

  // Autoplay video
  useEffect(() => {
    if (currentItem?.type === 'video' && videoRef.current) {
      setProgressPercent(0);
      videoRef.current.play().catch(() => {});

      const updateVideoProgress = () => {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          setProgressPercent(Math.min(100, (video.currentTime / video.duration) * 100));
        }
        progressAnimationRef.current = requestAnimationFrame(updateVideoProgress);
      };
      progressAnimationRef.current = requestAnimationFrame(updateVideoProgress);
    }

    return () => {
      if (progressAnimationRef.current) cancelAnimationFrame(progressAnimationRef.current);
    };
  }, [currentItem, currentIndex]);

  // Show controls on mouse move
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 2000);
  };

  const openSettingsMode = () => {
    if (window.electronApp) {
      window.electronApp.openSettings().catch(() => {});
      return;
    }
    navigate('/launcher');
  };

  // Show default image when no active content
  if (showDefault) {
    return (
      <div
        ref={containerRef}
        className="player-screen fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-black"
        onMouseMove={handleMouseMove}
        style={{ cursor: showControls ? 'default' : 'none' }}
      >
        <img src={defaultImage} alt="Privzeta slika" className="h-full w-full object-contain bg-black" />
        {/* Controls overlay */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4">
            <button
              onClick={openSettingsMode}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/20 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Nastavitve
            </button>
          </div>
          <div className="absolute bottom-4 right-4 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-mono text-primary-foreground">
            Privzeta slika
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !defaultImage) {
    return (
      <div ref={containerRef} className="player-screen flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl font-mono text-player-foreground opacity-60">Ni vsebin za predvajanje</p>
          <button
            onClick={openSettingsMode}
            className="rounded-lg px-6 py-2 font-medium text-primary hover:bg-primary/10 transition-colors"
          >
          Nazaj na nastavitve
          </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="player-screen fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-black"
      onMouseMove={handleMouseMove}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {/* Content */}
      {currentItem?.type === 'image' ? (
        <img
          key={currentItem.id + currentIndex}
          src={currentItem.dataUrl}
          alt={currentItem.name}
          className="h-full w-full object-contain bg-black animate-fade-in"
        />
      ) : currentItem?.type === 'video' ? (
        <video
          key={currentItem.id + currentIndex}
          ref={videoRef}
          src={currentItem.dataUrl}
          className="h-full w-full object-contain bg-black"
          muted
          onEnded={handleVideoEnded}
          onTimeUpdate={handleVideoTimeUpdate}
        />
      ) : null}

      {/* Progress bar */}
      {progressEnabled && currentItem && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-foreground/10">
          <div
            className="h-full bg-primary transition-none"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: progressColor,
            }}
          />
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4">
          <button
            onClick={openSettingsMode}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/20 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Nastavitve
          </button>
        </div>
        <div className="absolute bottom-4 right-4 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-mono text-primary-foreground">
          {currentIndex + 1} / {items.length}
          {runtimeDeviceId ? ` · ${runtimeDeviceId}` : ''}
        </div>
        {window.electronApp && (
          <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-primary-foreground">
            Izhod iz kiosk: Ctrl/Cmd + Shift + F12
          </div>
        )}
      </div>
    </div>
  );
};

export default Player;
