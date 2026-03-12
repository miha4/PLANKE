import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, Upload, Monitor, Clock, CalendarDays, Image, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ContentItem,
  getContentItems,
  addContentItem,
  removeContentItem,
  updateContentItem,
  fileToDataUrl,
} from '@/lib/content-store';
import { toast } from 'sonner';

const Dashboard = () => {
  const [items, setItems] = useState<ContentItem[]>(getContentItems);
  const [durationDays, setDurationDays] = useState(7);
  const [displaySeconds, setDisplaySeconds] = useState(10);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const refresh = () => setItems(getContentItems());

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
        const dataUrl = await fileToDataUrl(file);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
        addContentItem({
          name: file.name,
          type: isImage ? 'image' : 'video',
          dataUrl,
          displayDurationSeconds: isImage ? displaySeconds : 0,
          expiresAt: expiresAt.toISOString(),
        });
        toast.success(`Dodano: ${file.name}`);
      } catch {
        toast.error(`Napaka pri nalaganju: ${file.name}`);
      }
    }
    refresh();
  }, [durationDays, displaySeconds]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = (id: string, name: string) => {
    removeContentItem(id);
    refresh();
    toast.success(`Odstranjeno: ${name}`);
  };

  const handleUpdateSeconds = (id: string, seconds: number) => {
    updateContentItem(id, { displayDurationSeconds: seconds });
    refresh();
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nadzorna plošča</h1>
            <p className="mt-1 text-muted-foreground">Upravljajte vsebino predvajalnika oglasov</p>
          </div>
          <Button onClick={() => navigate('/player')} size="lg" className="gap-2">
            <Monitor className="h-4 w-4" />
            Predvajaj
          </Button>
        </div>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Nastavitve za nove vsebine
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <Label htmlFor="days" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Trajanje (dni)
              </Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={365}
                value={durationDays}
                onChange={e => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seconds" className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Prikaz slike (sekunde)
              </Label>
              <Input
                id="seconds"
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
          <h2 className="text-xl font-bold">
            Vsebine ({items.length})
          </h2>
          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Play className="mb-3 h-10 w-10" />
                <p>Ni naloženih vsebin. Dodajte slike ali videe.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {items.map(item => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {item.type === 'image' ? <Image className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                          {item.type === 'image' ? 'Slika' : 'Video'}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          do {new Date(item.expiresAt).toLocaleDateString('sl-SI')}
                        </span>
                        {item.type === 'image' && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {item.displayDurationSeconds}s
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {item.type === 'image' && (
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          value={item.displayDurationSeconds}
                          onChange={e => handleUpdateSeconds(item.id, Math.max(1, parseInt(e.target.value) || 10))}
                          className="w-20 text-center"
                          title="Trajanje prikaza (sekunde)"
                        />
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
