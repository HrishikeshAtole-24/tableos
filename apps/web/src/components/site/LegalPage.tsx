import s from './site.module.css';

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: Array<{ heading: string; body: string[] }> }) {
  return (
    <>
      <section className={s.pageHero}>
        <div className="container">
          <span className={s.kicker}>Legal</span>
          <h1>{title}</h1>
          <p>Last updated {updated}</p>
        </div>
      </section>
      <section className={s.section}>
        <article className={`container ${s.prose}`}>
          {sections.map((sec) => (
            <section key={sec.heading}>
              <h2>{sec.heading}</h2>
              {sec.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </article>
      </section>
    </>
  );
}
