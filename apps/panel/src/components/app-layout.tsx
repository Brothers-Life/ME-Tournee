import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ChevronsUpDownIcon, KeyRoundIcon, LockIcon, LogOutIcon, UserIcon, WarehouseIcon } from "lucide-react";
import type { Permission } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { NAV_GROUPS, ALL_NAV_ITEMS } from "@/components/nav";
import { DayPicker } from "@/components/date-picker";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
}

function AppSidebar() {
  const { me, depots, depotId, setDepotId, date, setDate, can } = useAuth();
  const { pathname } = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const allowed = (perms: Permission[]) => perms.some((p) => can(p));
  const current = ALL_NAV_ITEMS.find((i) => isActivePath(pathname, i.to));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  ME
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">ME Tournée</span>
                  <span className="truncate text-xs text-muted-foreground">Maison Esclaire</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="grid gap-2 group-data-[collapsible=icon]:hidden">
          {depots.length > 1 ? (
            <Select value={depotId ?? undefined} onValueChange={setDepotId}>
              <SelectTrigger className="w-full bg-background" aria-label="Dépôt courant">
                <WarehouseIcon className="text-muted-foreground" />
                <SelectValue placeholder="Choisir un dépôt" />
              </SelectTrigger>
              <SelectContent position="popper">
                {depots.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : depots[0] ? (
            <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm">
              <WarehouseIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{depots[0].name}</span>
            </div>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">Aucun dépôt accessible</p>
          )}
          {current?.daily && <DayPicker value={date} onChange={setDate} compact />}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => allowed(i.perms));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActivePath(pathname, item.to)} tooltip={item.label}>
                        <NavLink to={item.to} onClick={() => isMobile && setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/account"} tooltip="Mon compte">
              <NavLink to="/account" onClick={() => isMobile && setOpenMobile(false)}>
                <UserIcon />
                <span className="truncate">{me ? `${me.user.firstName} ${me.user.lastName}` : "Mon compte"}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu() {
  const { me, logout, lock } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const initials = `${me.user.firstName[0] ?? ""}${me.user.lastName[0] ?? ""}`.toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2" data-testid="user-menu">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">
            {me.user.firstName} {me.user.lastName}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">
            {me.user.firstName} {me.user.lastName}
          </div>
          <div className="truncate text-xs font-normal text-muted-foreground">{me.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/account")}>
          <UserIcon /> Mon compte
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={lock}>
          <LockIcon /> Verrouiller
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOutIcon /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { token, me, locked } = useAuth();
  const status = useRealtime(token, !locked);
  const { pathname } = useLocation();
  const current = ALL_NAV_ITEMS.find((i) => isActivePath(pathname, i.to));

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="truncate text-sm font-medium">{current?.label ?? (pathname === "/account" ? "Mon compte" : "")}</span>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    status === "open" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-muted-foreground/40",
                  )}
                  aria-label="Temps réel"
                />
              </TooltipTrigger>
              <TooltipContent>
                {status === "open" ? "Temps réel connecté" : status === "connecting" ? "Connexion au temps réel…" : "Temps réel déconnecté"}
              </TooltipContent>
            </Tooltip>
            <UserMenu />
          </div>
        </header>
        {me && !me.user.hasPanelPin && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <KeyRoundIcon className="size-4" />
            <span>Vous n'avez pas encore de code PIN personnel : il sert à déverrouiller le panel et à confirmer les actions sensibles.</span>
            <Button asChild size="xs" variant="outline" className="ml-auto">
              <Link to="/account">Créer mon PIN</Link>
            </Button>
          </div>
        )}
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
