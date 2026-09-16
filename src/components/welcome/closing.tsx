import Link from "next/link";
import { Camera } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";
import { Reveal } from "./reveal";

export function Closing() {
  return (
    <section className="content-max gutter py-20 text-center md:py-28">
      <Reveal>
        <p className="serif-display text-4xl md:text-6xl">What are you selling?</p>
        <p className="mx-auto mt-4 max-w-md text-secondary">Your first listing is a photo away.</p>
        <div className="mt-8">
          <Link href="/sign-up" className={buttonClasses("primary", "lg")}>
            <Camera className="size-5" aria-hidden /> Start with a photo
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
