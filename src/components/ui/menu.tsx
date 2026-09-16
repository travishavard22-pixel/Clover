"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSeparator = ({ className }: { className?: string }) => <M.Separator className={cn("my-1 h-px bg-border-subtle", className)} />;

export function MenuContent({ className, align = "end", children, ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-44 rounded-sm border border-border-default bg-surface-floating p-1 text-sm shadow-float animate-fade-in", className)}
        {...props}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ className, destructive, ...props }: M.DropdownMenuItemProps & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-xs px-2.5 py-2 outline-none data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50",
        destructive && "text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuCheckboxItem({ className, children, ...props }: M.DropdownMenuCheckboxItemProps) {
  return (
    <M.CheckboxItem className={cn("flex cursor-pointer select-none items-center gap-2 rounded-xs px-2.5 py-2 outline-none data-[highlighted]:bg-surface-sunken", className)} {...props}>
      <span className="flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <Check className="size-3.5" />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  );
}

export function MenuLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-muted", className)} {...props} />;
}
