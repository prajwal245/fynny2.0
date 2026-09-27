import { motion, AnimatePresence } from 'framer-motion'
import { useState, useId } from 'react'
import { colors } from '@/lib/design-system'

interface InteractiveGraphProps {
  data: Array<{ label: string; value: number }>
  height?: number
  formatValue?: (value: number) => string
  barColor?: string
  className?: string
}

export function InteractiveGraph({
  data,
  height = 300,
  formatValue = (v) => v.toLocaleString(),
  barColor = colors.primary[500],
  className = '',
}: InteractiveGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, '')

  if (!data?.length) return null

  // SVG viewBox in arbitrary units; SVG itself stretches to container width
  const VB_WIDTH = 1000
  const VB_HEIGHT = height
  const PAD_TOP = 24
  const PAD_BOTTOM = 32
  const PAD_X = 16
  const chartH = VB_HEIGHT - PAD_TOP - PAD_BOTTOM
  const chartW = VB_WIDTH - PAD_X * 2

  const rawMax = Math.max(...data.map((d) => d.value), 0)
  const maxValue = rawMax > 0 ? rawMax * 1.1 : 1
  const yScale = (v: number) => (v / maxValue) * chartH

  const gap = 8
  const slotW = chartW / data.length
  const barW = Math.max(20, slotW - gap)

  const baselineY = PAD_TOP + chartH

  return (
    <div className={`relative w-full ${className}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label="Bar chart"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barColor} stopOpacity="1" />
            <stop offset="100%" stopColor={barColor} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((r) => {
          const y = PAD_TOP + chartH * (1 - r)
          return (
            <line
              key={r}
              x1={PAD_X}
              x2={VB_WIDTH - PAD_X}
              y1={y}
              y2={y}
              stroke={colors.text.tertiary}
              strokeOpacity={0.2}
              strokeDasharray="4 4"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {/* Baseline */}
        <line
          x1={PAD_X}
          x2={VB_WIDTH - PAD_X}
          y1={baselineY}
          y2={baselineY}
          stroke={colors.text.tertiary}
          strokeOpacity={0.4}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {/* Bars */}
        {data.map((item, i) => {
          const h = yScale(item.value)
          const x = PAD_X + i * slotW + (slotW - barW) / 2
          const y = baselineY - h
          const isHovered = hoveredIndex === i
          const isAdjacent = hoveredIndex !== null && Math.abs(hoveredIndex - i) === 1

          return (
            <g key={i}>
              <motion.rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx={4}
                ry={4}
                fill={`url(#grad-${gradId})`}
                tabIndex={0}
                role="button"
                aria-label={`${item.label}: ${formatValue(item.value)}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
                style={{ transformOrigin: `${x + barW / 2}px ${baselineY}px`, cursor: 'pointer', outline: 'none' }}
                animate={{
                  scaleY: isHovered ? 1.05 : isAdjacent ? 0.95 : 1,
                  filter: isHovered ? `drop-shadow(0 0 12px ${barColor})` : 'drop-shadow(0 0 0 transparent)',
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />

              {/* Label */}
              <text
                x={x + barW / 2}
                y={baselineY + 20}
                textAnchor="middle"
                fontSize={12}
                fill={colors.text.secondary}
                style={{ fontFamily: "'DM Sans', sans-serif", pointerEvents: 'none' }}
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip overlay */}
      <AnimatePresence>
        {hoveredIndex !== null && (() => {
          const item = data[hoveredIndex]
          const leftPct = ((PAD_X + hoveredIndex * slotW + slotW / 2) / VB_WIDTH) * 100
          const barTopPx = PAD_TOP + (chartH - yScale(item.value))
          const topPct = (barTopPx / VB_HEIGHT) * 100
          return (
            <motion.div
              key={hoveredIndex}
              initial={{ opacity: 0, scale: 0.85, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: 'translate(-50%, calc(-100% - 12px))',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  background: '#2A1209',
                  border: '1px solid rgba(244,237,218,0.10)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)',
                  fontFamily: "'DM Sans', sans-serif",
                  minWidth: 80,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(244,237,218,0.55)', fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 14, color: '#F4EDDA', fontWeight: 700, fontFamily: "'SF Mono', monospace" }}>
                  {formatValue(item.value)}
                </div>
              </div>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -5,
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: 10,
                  height: 10,
                  background: '#2A1209',
                  borderRight: '1px solid rgba(244,237,218,0.10)',
                  borderBottom: '1px solid rgba(244,237,218,0.10)',
                }}
              />
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

export default InteractiveGraph
