interface Props {
  count: number;
  onClearAll: () => void;
}

const FloatingSelectionCounter = ({ count, onClearAll }: Props) => {
  if (count === 0) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full px-5 py-2.5"
      style={{
        background: "hsl(var(--fyn-ink))",
        boxShadow: "0 8px 32px rgba(23,18,8,0.30)",
        animation: "scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      <span className="text-white font-medium text-sm">{count} selected</span>
      <button
        onClick={onClearAll}
        className="text-[13px] transition-colors duration-150"
        style={{ color: "rgba(255,255,255,0.60)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
      >
        Clear all
      </button>
    </div>
  );
};

export default FloatingSelectionCounter;
