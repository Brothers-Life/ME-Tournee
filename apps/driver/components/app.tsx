// Briques d'écran de l'app chauffeur : grands boutons, lisibles à 5 h du matin.
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { takePhoto } from '@/lib/device';
import { flush, queuePhoto, useStore, clearRejected } from '@/lib/store';
import { cn } from '@/lib/utils';
import { CameraIcon, CloudOffIcon, RefreshCwIcon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Image, Pressable, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, className, ...props }: ScrollViewProps & { className?: string }) {
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <SyncBar />
      <ScrollView contentContainerClassName={cn('gap-4 p-4 pb-16', className)} keyboardShouldPersistTaps="handled" {...props}>
        <View className="w-full max-w-xl gap-4 self-center">{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Section({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      {title ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold">{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function BigButton({
  label,
  onPress,
  variant = 'default',
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>['as'];
}) {
  return (
    <Button size="lg" variant={variant} disabled={disabled} onPress={onPress} className="h-14 w-full">
      {icon ? <Icon as={icon} className={variant === 'default' ? 'text-primary-foreground' : variant === 'destructive' ? 'text-white' : 'text-foreground'} /> : null}
      <Text className="text-base">{label}</Text>
    </Button>
  );
}

/** Choix Oui / Non en deux gros boutons. `good` indique la réponse attendue (verte). */
export function YesNo({ label, value, onChange, good = true }: { label: string; value: boolean | null; onChange: (v: boolean) => void; good?: boolean }) {
  const btn = (v: boolean, text: string) => {
    const selected = value === v;
    const ok = v === good;
    return (
      <Pressable
        onPress={() => onChange(v)}
        className={cn(
          'h-12 flex-1 items-center justify-center rounded-lg border',
          selected ? (ok ? 'border-emerald-600 bg-emerald-600' : 'border-red-600 bg-red-600') : 'border-border bg-background',
        )}>
        <Text className={cn('font-semibold', selected ? 'text-white' : 'text-foreground')}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <View className="gap-2">
      <Text className="text-sm">{label}</Text>
      <View className="flex-row gap-2">
        {btn(true, 'Oui')}
        {btn(false, 'Non')}
      </View>
    </View>
  );
}

export interface PhotoRef {
  id: string; // identifiant provisoire, remplacé par celui du serveur à l'envoi
  uri: string;
}

export function PhotoField({ label, photos, onChange, max = 6 }: { label: string; photos: PhotoRef[]; onChange: (p: PhotoRef[]) => void; max?: number }) {
  const add = async () => {
    const uri = await takePhoto();
    if (!uri) return;
    onChange([...photos, { id: queuePhoto(uri), uri }]);
  };
  return (
    <View className="gap-2">
      <Text className="text-sm">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {photos.map((p) => (
          <View key={p.id} className="relative">
            <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: 8 }} />
            <Pressable onPress={() => onChange(photos.filter((x) => x.id !== p.id))} className="absolute -right-2 -top-2 rounded-full bg-black/70 p-1">
              <Icon as={XIcon} className="size-3 text-white" />
            </Pressable>
          </View>
        ))}
        {photos.length < max ? (
          <Pressable onPress={add} className="h-[84px] w-[84px] items-center justify-center gap-1 rounded-lg border border-dashed border-border">
            <Icon as={CameraIcon} className="size-6 text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">Photo</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Bandeau d'état : hors-ligne, actions en attente d'envoi, actions refusées par le serveur. */
export function SyncBar() {
  const online = useStore((s) => s.online);
  const pending = useStore((s) => s.outbox.length);
  const syncing = useStore((s) => s.syncing);
  const rejected = useStore((s) => s.rejected);
  return (
    <View>
      {!online || pending > 0 ? (
        <Pressable onPress={() => void flush()} className={cn('flex-row items-center justify-center gap-2 px-4 py-2', online ? 'bg-amber-500' : 'bg-zinc-800')}>
          <Icon as={online ? RefreshCwIcon : CloudOffIcon} className="size-4 text-white" />
          <Text className="text-sm font-medium text-white">
            {!online ? 'Hors-ligne' : syncing ? 'Envoi en cours' : 'En attente'}
            {pending > 0 ? ` · ${pending} action${pending > 1 ? 's' : ''} à envoyer` : ''}
          </Text>
        </Pressable>
      ) : null}
      {rejected.length > 0 ? (
        <Pressable onPress={clearRejected} className="gap-1 bg-red-600 px-4 py-2">
          {rejected.map((r, i) => (
            <Text key={i} className="text-sm text-white">
              {r.label} refusé : {r.error}
            </Text>
          ))}
          <Text className="text-xs text-white/80">Toucher pour masquer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} onChangeText={(t) => onChange(t.replace(/[^0-9.,-]/g, ''))} keyboardType="numeric" placeholder={placeholder} className="h-12 text-lg" />;
}

export const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  pending: { label: 'À livrer', className: 'bg-zinc-200 dark:bg-zinc-700' },
  arrived: { label: 'Sur place', className: 'bg-sky-200 dark:bg-sky-800' },
  delivered: { label: 'Livré', className: 'bg-emerald-200 dark:bg-emerald-800' },
  partial: { label: 'Livré avec incident', className: 'bg-amber-200 dark:bg-amber-800' },
  failed: { label: 'Non livré', className: 'bg-red-200 dark:bg-red-800' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, className: 'bg-zinc-200' };
  return (
    <View className={cn('rounded-full px-2 py-0.5', s.className)}>
      <Text className="text-xs font-medium">{s.label}</Text>
    </View>
  );
}

export function toNumber(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}
