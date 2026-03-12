export interface ContentItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  dataUrl: string; // base64 or object URL
  displayDurationSeconds: number; // for images, default 10
  expiresAt: string; // ISO date string
  createdAt: string;
  order: number;
}

const STORAGE_KEY = 'ad-player-content';

export function getContentItems(): ContentItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const items: ContentItem[] = JSON.parse(data);
    // Filter out expired items
    const now = new Date();
    return items.filter(item => new Date(item.expiresAt) > now).sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export function saveContentItems(items: ContentItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addContentItem(item: Omit<ContentItem, 'id' | 'createdAt' | 'order'>): ContentItem {
  const items = getContentItems();
  const newItem: ContentItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    order: items.length,
  };
  items.push(newItem);
  saveContentItems(items);
  return newItem;
}

export function removeContentItem(id: string): void {
  const items = getContentItems().filter(item => item.id !== id);
  saveContentItems(items);
}

export function updateContentItem(id: string, updates: Partial<ContentItem>): void {
  const items = getContentItems().map(item =>
    item.id === id ? { ...item, ...updates } : item
  );
  saveContentItems(items);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
