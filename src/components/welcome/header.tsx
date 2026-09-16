import Link from "next/link";
import { CloverWordmark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button-classes";

export function WelcomeHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-surface-base/85 backdrop-blur">
      <div className="content-max flex h-(--topbar-h) items-center justify-between gutter">
        <Link href="/welcome" aria-label="Clover home" className="rounded-xs">
          <CloverWordmark size={22} />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonClasses("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonClasses("primary", "sm")}>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
