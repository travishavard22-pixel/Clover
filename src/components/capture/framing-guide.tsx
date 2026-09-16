/** Four faint corner brackets over the viewfinder. Decorative for sighted users; hidden from AT. */
export function FramingGuide() {
  const corner = "absolute size-7 border-white/70";
  return (
    <div className="pointer-events-none absolute inset-[9%] sm:inset-[12%]" aria-hidden>
      <span className={`${corner} left-0 top-0 rounded-tl-[10px] border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 rounded-tr-[10px] border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-[10px] border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-[10px] border-b-2 border-r-2`} />
    </div>
  );
}
