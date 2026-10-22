"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Base UI Switch submete "on" quando ligado e nada quando desligado —
// o MESMO contrato de FormData que um <input type="checkbox"> nativo
// (e que o Checkbox deste design system já usa). Drop-in: nenhuma action
// ou schema que já lia um checkbox por este mecanismo precisa mudar.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-muted-foreground/30 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-blue-600",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
