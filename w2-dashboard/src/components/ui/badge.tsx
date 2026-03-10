import { cn, PROVIDER_COLORS } from '../../lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  provider?: string
  variant?: 'default' | 'outline'
}

export function Badge({
  provider,
  variant = 'default',
  className,
  children,
  ...props
}: BadgeProps) {
  const color = provider ? PROVIDER_COLORS[provider] : undefined
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'outline' ? 'border' : '',
        className
      )}
      style={
        color
          ? {
              backgroundColor: variant === 'default' ? color + '22' : 'transparent',
              borderColor: color,
              color: color,
            }
          : undefined
      }
      {...props}
    >
      {children}
    </span>
  )
}
