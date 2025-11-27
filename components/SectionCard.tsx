import React from 'react'

interface SectionCardProps {
  title: string
  children: React.ReactNode
  accent?: string
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  children,
  accent = 'from-primary/30 to-secondary/20',
}) => (
  <div className="glass fade-card rounded-2xl border border-white/10 p-5 shadow-lg">
    <div className="mb-3 text-sm uppercase tracking-[0.3em] text-white/60">
      {title}
    </div>
    <div className={`rounded-xl bg-gradient-to-r ${accent} p-[1px]`}>
      <div className="rounded-[10px] bg-black/60 p-4">{children}</div>
    </div>
  </div>
)

