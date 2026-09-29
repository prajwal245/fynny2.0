import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { colors } from '@/lib/design-system'

interface GalaxyButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  className?: string
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function GalaxyButton({
  children,
  variant = 'primary',
  className = '',
  onClick,
  disabled = false,
  type = 'button',
}: GalaxyButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  const variantConfig = {
    primary: { bg: [colors.primary[500], colors.primary[700]], glow: colors.primary[500], particle: colors.accent[500] },
    secondary: { bg: [colors.accent[500], colors.accent[600]], glow: colors.accent[500], particle: colors.primary[500] },
    danger: { bg: [colors.danger.main, colors.danger.dark], glow: colors.danger.main, particle: colors.accent[500] },
    success: { bg: [colors.success.main, colors.success.light], glow: colors.success.main, particle: colors.accent[500] },
  } as const

  const config = variantConfig[variant]

  const particles = Array.from({ length: 12 }).map((_, i) => {
    const angle = i * 30 * (Math.PI / 180)
    return { x: Math.cos(angle) * 60, y: Math.sin(angle) * 60 }
  })

  const active = isHovered && !disabled

  return (
    <div className={`relative inline-block ${className}`} style={{ perspective: 1000 }}>
      {/* Radial glow */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${config.glow}, transparent 70%)`,
          filter: 'blur(40px)',
        }}
        animate={{
          scale: active ? 1.2 : 1,
          opacity: active ? 0.9 : 0.6,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />

      <motion.button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        className="relative px-6 py-3 rounded-xl text-white overflow-hidden outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        style={{
          background: `linear-gradient(135deg, ${config.bg[0]} 0%, ${config.bg[1]} 100%)`,
          transformStyle: 'preserve-3d',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          pointerEvents: disabled ? 'none' : 'auto',
          fontFamily: "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          letterSpacing: '-0.01em',
          // @ts-expect-error CSS custom prop for focus ring color
          '--tw-ring-color': config.glow,
          border: 'none',
        }}
        whileHover={disabled ? {} : { scale: 1.02, rotateX: -3, rotateY: 3 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* Shimmer sweep */}
        <motion.span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: active ? ['−200% 0%', '200% 0%'] : '−200% 0%' }}
          transition={{ duration: 1.5, ease: 'linear', repeat: active ? Infinity : 0 }}
        />

        {/* Particles */}
        {!disabled && particles.map((pos, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="motion-particle absolute rounded-full pointer-events-none"
            style={{
              width: 4, height: 4,
              left: '50%', top: '50%',
              background: config.particle,
              boxShadow: `0 0 8px ${config.particle}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={active
              ? { x: pos.x, y: pos.y, opacity: [0, 0.8, 0], scale: [0, 1, 0] }
              : { x: 0, y: 0, opacity: 0, scale: 0 }}
            transition={{ duration: 1.2, delay: i * 0.05, repeat: active ? Infinity : 0, ease: 'easeOut' }}
          />
        ))}

        {/* Rotating conic border */}
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            padding: 2,
            background: `conic-gradient(from 0deg, ${config.glow}, ${config.particle}, ${config.glow})`,
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />

        {/* Content */}
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
      </motion.button>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .motion-particle { display: none !important; }
        }
      `}</style>
    </div>
  )
}

export default GalaxyButton
