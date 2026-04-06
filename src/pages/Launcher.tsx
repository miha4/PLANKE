import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Settings2, Search, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { searchAdminAppAsync } from '@/lib/content-service';
import { toast } from 'sonner';

function getManualAdminApiBase() {
  const current = new URL(window.location.href);
  if (current.hostname.endsWith('.app.github.dev')) {
    const host = current.hostname.replace(/-\d+\./, '-8787.');
    return `${current.protocol}//${host}/api`;
  }

  const isLocal = current.hostname === 'localhost' || current.hostname === '127.0.0.1';
  const protocol = isLocal ? 'http:' : current.protocol;
  return `${protocol}//${current.hostname}:8787/api`;
}

const Launcher = () => {
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [discoveredApiBase, setDiscoveredApiBase] = useState<string | null>(null);
  const [playerFullscreen, setPlayerFullscreen] = useState(true);
  const manualApiBase = useMemo(() => getManualAdminApiBase(), []);

  useEffect(() => {
    window.electronApp?.getConfig().then(config => {
      setPlayerFullscreen(config.playerFullscreen);
    }).catch(() => {});
  }, []);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const found = await searchAdminAppAsync();
      if (found) {
        setDiscoveredApiBase(found);
        toast.success(`Najden admin app: ${found}`);
      } else {
        setDiscoveredApiBase(null);
        toast.error('Admin app ni bil najden samodejno. Uporabi ročni URL spodaj.');
      }
    } finally {
      setSearching(false);
    }
  };

  const openAdmin = async () => {
    if (window.electronApp) {
      await window.electronApp.setConfig({ startupMode: 'admin' });
      return;
    }
    navigate('/');
  };

  const openPlayer = async () => {
    if (window.electronApp) {
      await window.electronApp.setConfig({ startupMode: 'player', playerFullscreen });
      return;
    }
    navigate('/player');
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Izberi način aplikacije</h1>
          <p className="mt-1 text-muted-foreground">Pred zagonom izberi, ali bo naprava admin ali player.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Admin (Nadzorna plošča)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Urejanje vsebin in nalaganje slik/videov.</p>
              <Button className="w-full" onClick={openAdmin}>
                Odpri admin
              </Button>
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div className="font-medium flex items-center gap-2"><Server className="h-3.5 w-3.5" /> Podatki za ročni vnos (player)</div>
                <div>Port: <strong>8787</strong></div>
                <div>API base: <code>{manualApiBase}</code></div>
                <div>Health: <code>{manualApiBase}/health</code></div>
                <div>Content: <code>{manualApiBase}/content/active</code></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorPlay className="h-5 w-5 text-primary" />
                Player (Predvajalnik)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Predvajanje aktivnih vsebin v celozaslonskem načinu.</p>
              <div className="grid gap-2">
                <Button className="w-full" onClick={openPlayer}>
                  Odpri player
                </Button>
                <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>Player fullscreen ob zagonu</span>
                  <input
                    type="checkbox"
                    checked={playerFullscreen}
                    onChange={e => setPlayerFullscreen(e.target.checked)}
                  />
                </label>
                <Button variant="outline" className="w-full gap-2" onClick={handleSearch} disabled={searching}>
                  <Search className="h-4 w-4" />
                  {searching ? 'Iščem admin app...' : 'Iskanje admin appa'}
                </Button>
              </div>
              <div className="rounded-md border p-3 text-xs">
                <div className="font-medium">Najden admin API:</div>
                <div className="mt-1 break-all"><code>{discoveredApiBase || 'Ni najden (uporabi ročni URL iz Admin zavihka).'}</code></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Launcher;
