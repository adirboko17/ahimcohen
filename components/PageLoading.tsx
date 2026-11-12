export function PageLoading() {
  return (
    <main className="page-loading" aria-busy="true" aria-label="טעינת העמוד">
      <div className="brand-loader">
        <div className="brand-loader-mark">
          <span className="brand-loader-corner start" aria-hidden="true" />
          <img src="/logo.avif" width={330} height={67} alt="האחים כהן — Cohen Brothers" fetchPriority="high" />
          <span className="brand-loader-corner end" aria-hidden="true" />
        </div>
        <div className="brand-loader-track" aria-hidden="true"><span /></div>
        <p className="brand-loader-status" role="status">
          טוענים את העמוד
          <span className="brand-loader-dots" aria-hidden="true"><i /><i /><i /></span>
        </p>
      </div>
    </main>
  );
}
