export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Athens Pickleball</h1>
          <p className="mt-2 text-sm text-gray-600">Ladder League Platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
