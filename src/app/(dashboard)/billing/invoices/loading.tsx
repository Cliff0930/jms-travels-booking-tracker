export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="h-8 w-36 rounded-lg bg-gray-100 animate-pulse" />
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
