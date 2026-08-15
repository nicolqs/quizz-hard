'use client'

import { useState } from 'react'
import type { Control } from '@/lib/spaceteam'

// Your six controls. None of them do anything you would expect, and most of the
// time the instruction for one of them is on somebody else's phone.

export function Panel({
  controls,
  onAction,
  disabled,
}: {
  controls: Control[]
  onAction: (controlId: string, value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {controls.map((control) => (
        <ControlWidget key={control.id} control={control} onAction={onAction} disabled={disabled} />
      ))}
    </div>
  )
}

function ControlWidget({
  control,
  onAction,
  disabled,
}: {
  control: Control
  onAction: (controlId: string, value: number) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState(0)
  const [flash, setFlash] = useState(false)

  const send = (next: number) => {
    if (disabled) return
    setValue(next)
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    onAction(control.id, next)
  }

  const shell = `rounded-xl border p-2.5 transition-colors ${
    flash ? 'border-secondary bg-secondary/20' : 'border-white/10 bg-white/5'
  } ${disabled ? 'opacity-50' : ''}`

  return (
    <div className={shell}>
      <div className="mb-2 text-[11px] font-semibold uppercase leading-tight tracking-wide text-white/70">
        {control.name}
      </div>

      {control.type === 'button' && (
        <button
          onClick={() => send(0)}
          disabled={disabled}
          aria-label={`${control.name} press`}
          className="w-full rounded-lg bg-primary/80 py-3 text-sm font-bold text-slate-950 active:scale-95"
        >
          PRESS
        </button>
      )}

      {control.type === 'toggle' && (
        <button
          onClick={() => send(value === 1 ? 0 : 1)}
          disabled={disabled}
          aria-label={`${control.name} toggle`}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${
            value === 1 ? 'bg-secondary text-slate-950' : 'bg-white/10 text-white/60'
          }`}
        >
          <span>{value === 1 ? 'ON' : 'OFF'}</span>
          <span
            className={`inline-block h-4 w-4 rounded-full ${value === 1 ? 'bg-slate-950' : 'bg-white/40'}`}
          />
        </button>
      )}

      {(control.type === 'slider' || control.type === 'dial') && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: control.max }, (_, i) => i + 1).map((step) => (
            <button
              key={step}
              onClick={() => send(step)}
              disabled={disabled}
              aria-label={`${control.name} ${step}`}
              className={`h-9 flex-1 min-w-[28px] rounded-md text-sm font-bold ${
                value === step ? 'bg-primary text-slate-950' : 'bg-white/10 text-white/70'
              }`}
            >
              {step}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
