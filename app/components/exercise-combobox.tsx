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
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">
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
          className="h-12 w-full pl-4 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all shadow-inner"
        />
        <Search className="absolute right-4 top-3.5 size-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("Exerciții", "Exercises")}
          className="absolute z-[999] top-[76px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 p-1.5 shadow-2xl shadow-black"
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
                className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-all ${
                  value === ex
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20"
                    : index === active
                      ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-transparent"
                      : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent"
                }`}
              >
                <ExerciseName id={ex} />
              </li>
            ))
          ) : (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-4 text-sm text-zinc-500 text-center font-medium">
              <Text ro="Nu am găsit acest exercițiu." en="No matching exercise found." />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
