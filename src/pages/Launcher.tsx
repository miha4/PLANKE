import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Settings2, Search, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { searchAdminAppAsync, searchAdminByIpAsync, probeAdminApiBaseAsync } from '@/lib/content-service';
import { toast } from 'sonner';

function getManualAdminApiBase() {
  const current = new URL(window.location.href);
  if (current.protocol === 'file:') {
    return 'http://127.0.0.1:8787/api';
  }
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
  const [selectedApiBase, setSelectedApiBase] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<'admin' | 'player'>('admin');
  const [playerFullscreen, setPlayerFullscreen] = useState(true);
  const [playerChannel, setPlayerChannel] = useState<'A' | 'B' | 'C'>('A');
  const [progressBarEnabled, setProgressBarEnabled] = useState(true);
  const [progressBarColor, setProgressBarColor] = useState('#3b82f6');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIp, setWizardIp] = useState('');
  const [wizardSinglePort, setWizardSinglePort] = useState(8787);
  const [wizardPortFrom, setWizardPortFrom] = useState(8787);
  const [wizardPortTo, setWizardPortTo] = useState(8795);
  const [manualApiBaseInput, setManualApiBaseInput] = useState('');
  const [wizardSearching, setWizardSearching] = useState(false);
  const manualApiBase = useMemo(() => getManualAdminApiBase(), []);

  useEffect(() => {
    setSelectedApiBase(manualApiBase);
    window.electronApp?.getConfig().then(config => {
      setPlayerFullscreen(config.playerFullscreen);
      setProgressBarEnabled(config.progressBarEnabled !== false);
      setProgressBarColor(config.progressBarColor || '#3b82f6');
      setPlayerChannel(config.playerChannel || 'A');
      if (config.startupMode === 'admin' || config.startupMode === 'player') {
        setSelectedMode(config.startupMode);
      }
      if (config.preferredApiBase) {
        setSelectedApiBase(config.preferredApiBase);
        setManualApiBaseInput(config.preferredApiBase);
      }
    }).catch(() => {});
  }, [manualApiBase]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const found = await searchAdminAppAsync(selectedMode === 'player' ? manualApiBase : undefined);
      if (found) {
        setDiscoveredApiBase(found);
        setSelectedApiBase(found);
        toast.success(`Najden admin app: ${found}`);
      } else {
        setDiscoveredApiBase(null);
        if (selectedMode === 'player') {
          toast.error('Oddaljen admin app ni bil najden samodejno. Uporabi ročni URL spodaj.');
        } else {
          toast.error('Admin app ni bil najden samodejno. Uporabi ročni URL spodaj.');
        }
      }
    } finally {
      setSearching(false);
    }
  };

  const handleWizardScan = async () => {
    const from = Math.max(1, Math.min(65535, wizardPortFrom));
    const to = Math.max(from, Math.min(65535, wizardPortTo));
    const ports: number[] = [];
    for (let port = from; port <= to; port += 1) ports.push(port);

    setWizardSearching(true);
    try {
      const found = await searchAdminByIpAsync(wizardIp, ports);
      if (found) {
        setDiscoveredApiBase(found);
        setSelectedApiBase(found);
        setManualApiBaseInput(found);
        toast.success(`Najden admin app na ${found}`);
      } else {
        toast.error('Na vpisanem IP-ju ni najdenega admin appa v izbranem port range-u.');
      }
    } finally {
      setWizardSearching(false);
    }
  };

  const handleQuickScan = async () => {
    const from = Math.max(1, Math.min(65535, wizardSinglePort));
    setWizardSearching(true);
    try {
      const found = await searchAdminByIpAsync(wizardIp, [from]);
      if (found) {
        setDiscoveredApiBase(found);
        setSelectedApiBase(found);
        setManualApiBaseInput(found);
        toast.success(`Najden admin app na ${found}`);
      } else {
        toast.error(`Admin app ni najden na ${wizardIp}:${from}.`);
      }
    } finally {
      setWizardSearching(false);
    }
  };

  const applyManualApiBase = async () => {
    const value = manualApiBaseInput.trim();
    if (!value) return;
    const ok = await probeAdminApiBaseAsync(value);
    if (!ok) {
      toast.error('Vpisan API ni dosegljiv (/api/health ne odgovori).');
      return;
    }
    const normalized = value.replace(/\/$/, '').replace(/\/api$/, '/api');
    setSelectedApiBase(normalized);
    setDiscoveredApiBase(normalized);
    toast.success(`Uporabljen API: ${normalized}`);
    setWizardOpen(false);
  };

  const openAdmin = async () => {
    if (window.electronApp) {
      await window.electronApp.setConfig({
        startupMode: 'admin',
        preferredApiBase: selectedApiBase || manualApiBase,
        progressBarEnabled,
        progressBarColor,
      });
      return;
    }
    navigate('/admin');
  };

  const openPlayer = async () => {
    if (window.electronApp) {
      await window.electronApp.setConfig({
        startupMode: 'player',
        playerFullscreen,
        playerChannel,
        preferredApiBase: selectedApiBase || manualApiBase,
        progressBarEnabled,
        progressBarColor,
      });
      return;
    }
    localStorage.setItem('player-progress-enabled', progressBarEnabled ? '1' : '0');
    localStorage.setItem('player-progress-color', progressBarColor);
    localStorage.setItem('player-channel', playerChannel);
    navigate(`/player?channel=${playerChannel}`);
  };

  const proceedWithSelection = async () => {
    if (selectedMode === 'admin') await openAdmin();
    else await openPlayer();
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Izberi način aplikacije</h1>
          <p className="mt-1 text-muted-foreground">Pred zagonom izberi, ali bo naprava admin ali player.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSelectedMode('admin')}
            className={`cursor-pointer transition-transform duration-200 hover:scale-[1.02] ${selectedMode === 'admin' ? 'ring-2 ring-primary bg-primary/5' : ''}`}
          >
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

          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSelectedMode('player')}
            className={`cursor-pointer transition-transform duration-200 hover:scale-[1.02] ${selectedMode === 'player' ? 'ring-2 ring-primary bg-primary/5' : ''}`}
          >
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
                <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>Progress bar omogočen</span>
                  <input
                    type="checkbox"
                    checked={progressBarEnabled}
                    onChange={e => setProgressBarEnabled(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>Barva progress bara</span>
                  <input
                    type="color"
                    value={progressBarColor}
                    onChange={e => setProgressBarColor(e.target.value)}
                  />
                </label>

                <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>Player kanal</span>
                  <select
                    className="rounded border px-2 py-1 bg-background"
                    value={playerChannel}
                    onChange={e => setPlayerChannel((e.target.value as 'A' | 'B' | 'C'))}
                  >
                    <option value="A">Kanal A</option>
                    <option value="B">Kanal B</option>
                    <option value="C">Kanal C</option>
                  </select>
                </label>
                <Button variant="outline" className="w-full gap-2" onClick={handleSearch} disabled={searching}>
                  <Search className="h-4 w-4" />
                  {searching ? 'Iščem admin app...' : 'Iskanje admin appa'}
                </Button>
                <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">Čarovnik: hitra povezava player ↔ admin</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Poveži player na admin</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Najprej poskusi hiter scan na tipičnem portu 8787. Port range uporabi samo, če je admin nastavljen na drug port.
                      </p>
                      <div className="space-y-2">
                        <Label>IP naslov admin naprave</Label>
                        <Input value={wizardIp} onChange={e => setWizardIp(e.target.value)} placeholder="192.168.1.50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Hiter scan (en port)</Label>
                        <Input type="number" value={wizardSinglePort} onChange={e => setWizardSinglePort(parseInt(e.target.value) || 8787)} />
                        <Button className="w-full" onClick={handleQuickScan} disabled={wizardSearching || !wizardIp.trim()}>
                          {wizardSearching ? 'Iščem...' : 'Preveri ta IP + port'}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Napredni scan: port od</Label>
                          <Input type="number" value={wizardPortFrom} onChange={e => setWizardPortFrom(parseInt(e.target.value) || 8787)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Napredni scan: port do</Label>
                          <Input type="number" value={wizardPortTo} onChange={e => setWizardPortTo(parseInt(e.target.value) || 8795)} />
                        </div>
                      </div>
                      <Button className="w-full" onClick={handleWizardScan} disabled={wizardSearching || !wizardIp.trim()}>
                        {wizardSearching ? 'Iščem...' : 'Napredni scan po port range-u'}
                      </Button>
                      <div className="rounded border p-2 text-xs">
                        Predlagan ročni URL: <code>http://{wizardIp || 'IP_ADMIN'}:{wizardSinglePort}/api</code>
                      </div>
                      <div className="space-y-2">
                        <Label>Ročni vnos API (fallback)</Label>
                        <Input value={manualApiBaseInput} onChange={e => setManualApiBaseInput(e.target.value)} placeholder="http://192.168.1.50:8787/api" />
                        <Button variant="secondary" className="w-full" onClick={applyManualApiBase}>
                          Uporabi ročni API
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="rounded-md border p-3 text-xs space-y-2">
                <div className="font-medium">Najden admin API:</div>
                <button
                  className={`w-full break-all rounded border p-2 text-left ${selectedApiBase === manualApiBase ? 'border-primary bg-primary/10' : ''}`}
                  onClick={() => setSelectedApiBase(manualApiBase)}
                >
                  <code>{manualApiBase}</code>
                </button>
                {discoveredApiBase && (
                  <button
                    className={`w-full break-all rounded border p-2 text-left ${selectedApiBase === discoveredApiBase ? 'border-primary bg-primary/10' : ''}`}
                    onClick={() => setSelectedApiBase(discoveredApiBase)}
                  >
                    <code>{discoveredApiBase}</code>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button size="lg" onClick={proceedWithSelection}>
            Nadaljuj kot: {selectedMode === 'admin' ? 'Admin' : 'Player'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Launcher;
