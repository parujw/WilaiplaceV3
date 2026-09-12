import { BottomNav } from "./BottomNav";

/** โครงหน้าจอทุกหน้าที่ล็อกอินแล้ว — เว้นที่ล่างไว้ให้แถบเมนูลอย */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame pb-28">
      {children}
      <BottomNav />
    </div>
  );
}
