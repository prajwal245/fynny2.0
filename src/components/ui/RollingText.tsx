import { motion } from 'framer-motion'

interface RollingTextProps {
  text: string
  className?: string
}

export function RollingText({ text, className = '' }: RollingTextProps) {
  const letters = text.split('')

  return (
    <motion.span
      className={`inline-flex ${className}`}
      initial="rest"
      whileHover="hover"
      animate="rest"
    >
      {letters.map((letter, index) => {
        const isSpace = letter === ' '
        return (
          <motion.span
            key={index}
            className="inline-block"
            style={{ willChange: 'transform' }}
            variants={{
              rest: { y: 0 },
              hover: isSpace
                ? { y: 0 }
                : {
                    y: [0, -5, 0],
                    transition: { duration: 0.3, delay: index * 0.05, ease: 'easeInOut' },
                  },
            }}
          >
            {isSpace ? '\u00A0' : letter}
          </motion.span>
        )
      })}
    </motion.span>
  )
}

export default RollingText
