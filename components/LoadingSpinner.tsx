'use client'

interface LoadingSpinnerProps {
  message?: string
  subMessage?: string
}

export function LoadingSpinner({ message = 'Loading...', subMessage }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      {/* Animated spinner */}
      <div className="relative h-24 w-24">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
        {/* Spinning ring */}
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary border-r-primary"></div>
        {/* Inner pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-pulse rounded-full bg-secondary"></div>
        </div>
      </div>

      {/* Loading text */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-primary animate-pulse">{message}</h3>
        {subMessage && (
          <p className="mt-2 text-sm text-white/70 light:text-black/70">{subMessage}</p>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex gap-2">
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }}></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }}></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  )
}

