'use client';

/**
 * The 110 km/h callout — sourced from research/07-110kmh-clearzone-nordic-comparison.md.
 */
export default function Callout110({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 lg:p-6"
      style={{ background: 'rgba(5,8,13,.7)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Um 110 km/klst hámarkshraða"
    >
      <div
        className="panel max-h-[80vh] w-full max-w-[560px] overflow-y-auto overscroll-contain p-4 supports-[height:1dvh]:max-h-[85dvh] lg:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-extrabold leading-tight">
            110 km/klst er þegar löglegt.<br />
            Hindrunin er túlkun, ekki verkfræði.
          </h2>
          <button className="btn" onClick={onClose} aria-label="Loka">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <p>
            <strong style={{ color: 'var(--ink)' }}>Lögin leyfa 110.</strong> Umferðarlög nr. 77/2019, 37. gr.:
            heimilt er að ákveða allt að 110 km/klst þar sem akstursstefnur eru aðgreindar. Heimildin hefur aldrei
            verið nýtt.
          </p>
          <p>
            <strong style={{ color: 'var(--ink)' }}>Ráðuneytið nefndi 18 m hindranalaust svæði</strong> beggja vegna
            vegar sem skilyrði (svar á Alþingi, þskj. 917/150) — en veghönnunarreglur Vegagerðarinnar sjálfrar gera
            ráð fyrir 10–12 m grunnbreidd öryggissvæðis við 110 km/klst, og segja beinlínis að hindranir megi{' '}
            <em>„verja með vegriði eða vegriðspúða“</em>. Vegrið kemur í stað svæðisins — í íslensku reglunum eins og
            þeim norrænu.
          </p>
          <div className="rounded-md border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="eyebrow mb-2">Norðurlöndin, sambærilegir vegir</div>
            <table className="mono w-full text-[11px]">
              <tbody>
                {[
                  ['Svíþjóð', '110 á 2+1 vegum með víravegriði — heildarbreidd 13–14 m, öryggissvæði niður í 5 m'],
                  ['Noregur', '110 á mótorvegum síðan 2014 — reglan: náist ekki öryggissvæði skal setja vegrið'],
                  ['Danmörk', '130 á hraðbrautum — öryggissvæði ~11 m'],
                  ['Finnland', '120 á sumrin, breytileg mörk eftir árstíð'],
                  ['Ísland', '90 alls staðar — einnig á fullbúinni 2+2 Reykjanesbraut'],
                ].map(([c, t]) => (
                  <tr key={c}>
                    <td className="pr-3 align-top font-bold" style={{ color: 'var(--ink)' }}>
                      {c}
                    </td>
                    <td className="pb-1.5" style={{ color: 'var(--ink-2)' }}>
                      {t}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Heimildir: Veghönnunarreglur Vegagerðarinnar 02 Þversnið §2.3 (tafla 2.3-1) og 05.4 Vegrið; svar
            samgönguráðherra þskj. 917/150; Statens vegvesen håndbok N101 §2.2; Trafikverket VGU 2022 §6.4.2 og
            §7.1.2.4.1; sjá research/07 í heimildasafni verkefnisins.
          </p>
        </div>
      </div>
    </div>
  );
}
