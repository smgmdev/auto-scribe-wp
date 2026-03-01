export function AdminSurveillanceView() {
  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Surveillance
          </h1>
          <p className="mt-2 text-muted-foreground">
            Monitor and review system activity
          </p>
        </div>

        {/* Placeholder content */}
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-sm">Surveillance dashboard coming soon.</p>
        </div>
      </div>
    </div>
  );
}
