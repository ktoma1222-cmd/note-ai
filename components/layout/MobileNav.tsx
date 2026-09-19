import { NavLinks } from "./nav-links";

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
      <NavLinks variant="mobile" />
    </nav>
  );
}
