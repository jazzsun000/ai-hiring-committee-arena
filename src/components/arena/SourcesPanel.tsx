export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface SourcesPanelProps {
  sources: Source[];
  provider: string;
  loading?: boolean;
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SourcesPanel({ sources, provider, loading = false }: SourcesPanelProps) {
  return (
    <section className="panel sources" aria-busy={loading}>
      <header className="panel-head">
        <h3>Interview context ({provider})</h3>
        <span className="panel-count">{loading ? '…' : sources.length}</span>
      </header>
      {loading ? (
        <ul className="sources-list" aria-label="Loading sources">
          {[0, 1, 2].map((i) => (
            <li key={i} className="source source--skeleton">
              <span />
              <span />
            </li>
          ))}
        </ul>
      ) : sources.length === 0 ? (
        <p className="panel-empty">No retrieved sources</p>
      ) : (
        <ol className="sources-list">
          {sources.map((s, i) => (
            <li key={s.url + i} className="source">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="source-link">
                <span className="source-idx mono">{i + 1}</span>
                <span className="source-body">
                  <span className="source-title">{s.title}</span>
                  <span className="source-host">{host(s.url)} ↗</span>
                  {s.snippet && <span className="source-snippet">{s.snippet}</span>}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default SourcesPanel;
