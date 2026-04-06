import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Trash2, Upload, Monitor, Clock, CalendarDays, Image, Film,
  ImageOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ContentItem } from '@/lib/content-store';
import {
  getAllContentItemsAsync,
  uploadMediaAsync,
  addContentItemAsync,
  removeContentItemAsync,
  updateContentItemAsync,
  getDefaultImageAsync,
  setDefaultImageAsync,
  removeDefaultImageAsync,
  isBackendUnavailableError,
} from '@/lib/content-service';
import { toast } from 'sonner';

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateSl(iso: string): string {
  return new Date(iso).toLocaleDateString('sl-SI');
}

const Dashboard = () => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [displaySeconds, setDisplaySeconds] = useState(10);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [dragOver, setDragOver] = useState(false);
  const [defaultImg, setDefaultImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultImgInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      setItems(await getAllContentItemsAsync());
    } catch (error) {
      if (isBackendUnavailableError(error)) {
        toast.error('Backend ni dosegljiv. Zaženi backend in preveri, da je port 8787 forwardan (Codespaces).');
      } else {
        toast.error('Napaka pri nalaganju vsebin');
      }
      setItems([]);
    }
  };

  useEffect(() => {
    (async () => {
      await refresh();
      try {
        setDefaultImg(await getDefaultImageAsync());
      } catch (error) {
        if (!isBackendUnavailableError(error)) {
          toast.error('Napaka pri nalaganju privzete slike');
        }
      }
    })();
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) {
        toast.error(`Nepodprta datoteka: ${file.name}`);
        continue;
      }
      try {
        const mediaUrl = await uploadMediaAsync(file);
        await addContentItemAsync({
          name: file.name,
          type: isImage ? 'image' : 'video',
          dataUrl: mediaUrl,
          displayDurationSeconds: isImage ? displaySeconds : 0,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
        });
        toast.success(`Dodano: ${file.name}`);
      } catch {
        toast.error(`Napaka pri nalaganju: ${file.name}`);
      }
    }
    await refresh();
  }, [startDate, endDate, displaySeconds]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = (id: string, name: string) => {
    removeContentItemAsync(id)
      .then(refresh)
      .then(() => toast.success(`Odstranjeno: ${name}`))
      .catch(error => {
        if (isBackendUnavailableError(error)) {
          toast.error('Backend ni dosegljiv. Zaženi backend in preveri, da je port 8787 forwardan (Codespaces).');
        } else {
          toast.error('Napaka pri odstranitvi vsebine');
        }
      });
  };

  const handleUpdate = (id: string, updates: Partial<ContentItem>) => {
    updateContentItemAsync(id, updates)
      .then(refresh)
      .catch(() => toast.error('Napaka pri posodobitvi vsebine'));
  };

  const handleDefaultImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Samo slike so dovoljene za privzeto sliko');
      return;
    }
    try {
      const mediaUrl = await uploadMediaAsync(file);
      await setDefaultImageAsync(mediaUrl);
      setDefaultImg(await getDefaultImageAsync());
      toast.success('Privzeta slika nastavljena');
    } catch (error) {
      if (isBackendUnavailableError(error)) {
        toast.error('Backend ni dosegljiv. Zaženi backend in preveri, da je port 8787 forwardan (Codespaces).');
      } else {
        toast.error('Napaka pri nastavitvi privzete slike');
      }
    }
  };

  const handleRemoveDefault = () => {
    removeDefaultImageAsync()
      .then(() => {
        setDefaultImg(null);
        toast.success('Privzeta slika odstranjena');
      })
      .catch(() => toast.error('Napaka pri odstranitvi privzete slike'));
  };

  const isExpired = (endDate: string) => new Date(endDate) < new Date();
  const isNotStarted = (startDate: string) => new Date(startDate) > new Date();

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nadzorna plošča</h1>
            <p className="mt-1 text-muted-foreground">Upravljajte vsebino predvajalnika oglasov</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/player')} size="lg" className="gap-2">
              <Monitor className="h-4 w-4" />
              Predvajaj
            </Button>
          </div>
        </div>

        {/* Default Image */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Image className="h-5 w-5 text-primary" />
              Privzeta slika
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Ta slika se prikaže, ko ni nobene aktivne vsebine za predvajanje.
            </p>
            <div className="flex items-center gap-4">
              {defaultImg ? (
                <>
                  <div className="h-20 w-32 overflow-hidden rounded-lg border bg-muted">
                    <img src={defaultImg} alt="Privzeta slika" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => defaultImgInputRef.current?.click()}>
                      Zamenjaj
                    </Button>
                    <Button variant="destructive" size="icon" onClick={handleRemoveDefault}>
                      <ImageOff className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => defaultImgInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Naloži privzeto sliko
                </Button>
              )}
              <input
                ref={defaultImgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleDefaultImage(e.target.files)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Settings for new uploads */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Nastavitve za nove vsebine
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Začetni datum
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Končni datum
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Prikaz slike (sekunde)
              </Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={displaySeconds}
                onChange={e => setDisplaySeconds(Math.max(1, parseInt(e.target.value) || 10))}
                className="w-28"
              />
            </div>
          </CardContent>
        </Card>

        {/* Upload area */}
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Povlecite datoteke ali kliknite za nalaganje</p>
          <p className="mt-1 text-sm text-muted-foreground">Slike (JPG, PNG, WebP) ali video (MP4, WebM)</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>

        {/* Content list */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Vsebine ({items.length})</h2>
          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Play className="mb-3 h-10 w-10" />
                <p>Ni naloženih vsebin. Dodajte slike ali videe.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {items.map(item => {
                const expired = isExpired(item.endDate);
                const notStarted = isNotStarted(item.startDate);
                return (
                  <Card key={item.id} className={`overflow-hidden ${expired ? 'opacity-50' : ''}`}>
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                      {/* Thumbnail */}
                      <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                        {item.type === 'image' ? (
                          <img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Film className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Info & individual controls */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{item.name}</p>
                          {expired && (
                            <span className="shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                              Poteklo
                            </span>
                          )}
                          {notStarted && !expired && (
                            <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Načrtovano
                            </span>
                          )}
                          {!expired && !notStarted && (
                            <span className="shrink-0 rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-foreground">
                              Aktivno
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">Od:</Label>
                            <Input
                              type="date"
                              value={toDateInputValue(item.startDate)}
                              onChange={e => handleUpdate(item.id, { startDate: new Date(e.target.value).toISOString() })}
                              className="h-8 w-36 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">Do:</Label>
                            <Input
                              type="date"
                              value={toDateInputValue(item.endDate)}
                              onChange={e => handleUpdate(item.id, { endDate: new Date(e.target.value + 'T23:59:59').toISOString() })}
                              className="h-8 w-36 text-xs"
                            />
                          </div>
                          {item.type === 'image' && (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">Sekunde:</Label>
                              <Input
                                type="number"
                                min={1}
                                max={120}
                                value={item.displayDurationSeconds}
                                onChange={e => handleUpdate(item.id, { displayDurationSeconds: Math.max(1, parseInt(e.target.value) || 10) })}
                                className="h-8 w-20 text-xs text-center"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.name)}
                        className="self-start sm:self-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
