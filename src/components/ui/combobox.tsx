"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Wrapper fino sobre o Combobox do Base UI (já dependência do projeto,
// mesma base de popover.tsx/select.tsx) — autocomplete acessível de
// verdade (role="combobox", listbox, navegação por teclado, Escape,
// clique fora) sem precisar reimplementar nada disso na mão. Usado por
// PainelBuscaHome.tsx (Cidade/Bairro) — itens são sempre uma lista já
// filtrada/pronta em memória (sem request por tecla, dataset pequeno por
// tenant), então não expõe as variantes async/virtualizadas do
// primitivo.
const Combobox = ComboboxPrimitive.Root

function ComboboxInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.InputGroup>) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "relative flex h-12 w-full items-center rounded-lg border border-gray-200 bg-white focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20",
        className
      )}
      {...props}
    />
  )
}

function ComboboxInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-full w-full min-w-0 border-0 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400",
        className
      )}
      {...props}
    />
  )
}

function ComboboxPortal(props: ComboboxPrimitive.Portal.Props) {
  return <ComboboxPrimitive.Portal {...props} />
}

function ComboboxClear({
  className,
  ...props
}: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600",
        className
      )}
      {...props}
    >
      <XIcon className="size-3.5" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxContent({
  className,
  sideOffset = 4,
  align = "start",
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxEmpty({
  className,
  ...props
}: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-3 py-3 text-sm text-gray-500", className)}
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-64 overflow-y-auto overscroll-contain py-1 outline-none",
        className
      )}
      {...props}
    />
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 px-3 py-2 text-sm text-gray-900 outline-none select-none data-highlighted:bg-primary/10 data-highlighted:text-primary",
        className
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="flex size-4 shrink-0 items-center justify-center">
        <CheckIcon className="size-3.5" />
      </ComboboxPrimitive.ItemIndicator>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </ComboboxPrimitive.Item>
  )
}

export {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxPortal,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
}
