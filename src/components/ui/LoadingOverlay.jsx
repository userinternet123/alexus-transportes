function LoadingOverlay({ children }) {
  return (
    <div className="mac-fondo fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-black/70 rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-[6px] border-amber-500 border-r-transparent animate-spin"></div>

          <div className="absolute inset-2 rounded-full border-[6px] border-green-500 border-l-transparent animate-spin"></div>
        </div>

        {children && <span className="text-white text-lg font-medium">{children}</span>}
      </div>
    </div>
  )
}

export default LoadingOverlay
