import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { colors } from '@/lib/design-system'

interface GradientBorderButtonProps {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function GradientBorderButton({ children, onClick, className = '' }: GradientBorderButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`relative inline-flex items-center justify-center rounded-2xl overflow-hidden ${className}`}
      style={{ padding: '2px', cursor: 'pointer', border: 'none', background: 'transparent' }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-2xl"
        style={{
          background: `conic-gradient(from 0deg, ${colors.primary[500]}, ${colors.accent[500]}, ${colors.primary[300]}, ${colors.accent[700]}, ${colors.primary[500]})`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
      <span
        className="relative z-10 px-7 py-3 rounded-2xl font-semibold"
        style={{ background: colors.bg.card, color: colors.text.primary }}
      >
        {children}
      </span>
    </motion.button>
  )
}
