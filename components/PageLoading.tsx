export function PageLoading() {
  return (
    <main className="wrap page-loading" aria-busy="true">
      <p role="status">טוענים את העמוד…</p>
      <div className="page-loading-title" aria-hidden="true" />
      <div className="page-loading-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="page-loading-card" key={index}>
            <div className="page-loading-image" />
            <div className="page-loading-line" />
            <div className="page-loading-line short" />
          </div>
        ))}
      </div>
    </main>
  );
}
