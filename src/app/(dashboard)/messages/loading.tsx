export default function Loading() {
  return (
    <div className="p-4 md:p-6 flex gap-4 h-[calc(100dvh-8rem)]">
      <div className="w-80 shrink-0 space-y-2">
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
      <div className="flex-1 space-y-3 pt-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
