export default function AppLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="h-4 w-24 rounded bg-gray-200 mb-2" />
            <div className="h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h-4 w-32 rounded bg-gray-200 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );
}
