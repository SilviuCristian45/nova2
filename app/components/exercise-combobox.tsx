"use client"

import { useId, useState } from "react"
import { Search } from "lucide-react"
import { Text, useLanguage } from "@/app/components/language-provider"
import { ExerciseName } from "@/app/components/exercise-name"
import { exerciseName, matchesExerciseQuery } from "@/lib/exercise-catalog"
import { nextActiveIndex } from "@/lib/combobox"

// Searchable exercise picker (WAI-ARIA combobox with a listbox popup): mouse, touch and keyboard.
// Remount it (change its `key`) when the list of exercises changes, so the search text starts empty.
export function ExerciseCombobox({
  exercises,
  value,
  onChange,
}: {
  exercises: string[]
  value: string
  onChange: (exercise: string) => void
}) {
  const { t, language } = useLanguage()
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const matches = exercises.filter((ex) => matchesExerciseQuery(ex, query))
  const optionId = (index: number) => `${id}-option-${index}`

  function choose(exercise: string) {
    onChange(exercise)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (event.key === "Enter") {
      // Never submit the surrounding form from the picker.
      if (open) {
        event.preventDefault()
        if (matches[active]) choose(matches[active])
      }
      return
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault()
      if (!open) setOpen(true)
      setActive((current) => nextActiveIndex(event.key, current, matches.length))
    }
  }

  return (
    <div className="flex flex-col gap-1.5 relative">
      <label htmlFor={id} className="pl-0.5 text-[13px] font-medium text-muted">
        <Text ro="Exercițiu / Aparat" en="Exercise / Machine" />
      </label>

      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 && matches[active] ? optionId(active) : undefined}
          autoComplete="off"
          value={open ? query : exerciseName(value, language)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery("")
            setActive(-1)
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={t("Caută exercițiul...", "Search exercises...")}
          className="min-h-[52px] w-full rounded-md border-[1.5px] border-transparent bg-inner pl-3.5 pr-10 font-medium text-foreground outline-none transition-colors focus:border-lime focus-visible:outline-none"
        />
        <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("Exerciții", "Exercises")}
          className="absolute inset-x-0 top-[84px] z-[999] max-h-72 overflow-y-auto rounded-lg bg-control p-1.5 text-foreground shadow-2xl shadow-black/40"
        >
          {matches.length > 0 ? (
            matches.map((ex, index) => (
              <li
                key={ex}
                id={optionId(index)}
                role="option"
                aria-selected={value === ex}
                ref={(node) => {
                  if (node && index === active) node.scrollIntoView({ block: "nearest" })
                }}
                // mousedown (not click) so the input keeps focus and onBlur does not close the list first
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(ex)
                }}
                className={`flex min-h-12 cursor-pointer items-center rounded-sm px-3 transition-colors ${
                  value === ex
                    ? "bg-lime-soft font-bold text-lime-text"
                    : index === active
                      ? "bg-inner"
                      : "hover:bg-inner"
                }`}
              >
                <ExerciseName id={ex} />
              </li>
            ))
          ) : (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-4 text-center font-medium text-muted">
              <Text ro="Nu am găsit acest exercițiu." en="No matching exercise found." />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
