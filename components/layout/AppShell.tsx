// El shell real (Sidebar + BottomNav) vive en AppShellWrapper dentro del root layout
// y persiste entre navegaciones. Este componente es un passthrough para compatibilidad.
export function AppShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
