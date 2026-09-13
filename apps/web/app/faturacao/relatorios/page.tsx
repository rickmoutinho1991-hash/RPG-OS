import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { calculateWithholdingTax } from "@rpg/core";

export const dynamic = "force-dynamic";

export default async function RelatoriosFinanceirosPage() {
  const supabase = createAdminClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*)
    `);

  const invList = invoices || [];

  let base23 = 0;
  let iva23 = 0;
  let base13 = 0;
  let iva13 = 0;
  let base6 = 0;
  let iva6 = 0;
  let baseIsenta = 0;

  for (const inv of invList) {
    const items = inv.invoice_items || [];
    for (const it of items) {
      const net = Number(it.quantity) * Number(it.unit_price);
      if (it.vat_rate === 23) {
        base23 += net;
        iva23 += Number(it.vat_amount || net * 0.23);
      } else if (it.vat_rate === 13) {
        base13 += net;
        iva13 += Number(it.vat_amount || net * 0.13);
      } else if (it.vat_rate === 6) {
        base6 += net;
        iva6 += Number(it.vat_amount || net * 0.06);
      } else {
        baseIsenta += net;
      }
    }
  }

  const totalIncidencia = base23 + base13 + base6 + baseIsenta;
  const totalIva = iva23 + iva13 + iva6;

  const retencao115 = calculateWithholdingTax({ grossAmount: totalIncidencia, ratePercentage: 11.5 });
  const retencao25 = calculateWithholdingTax({ grossAmount: totalIncidencia, ratePercentage: 25.0 });

  return (
    <main>
      <div className="page-header">
        <div>
          <h2>Relatórios Fiscais & Apuramento de IVA</h2>
          <p>Discriminação de incidências, taxas legais portuguesas e exportação oficial do SAF-T PT.</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/faturacao" className="button secondary">
            ← Voltar à Faturação
          </Link>
          <a
            href="/api/saft/export"
            download
            className="button"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            📥 Descarregar SAF-T PT (XML)
          </a>
        </div>
      </div>

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total Base Tributável</span>
          <strong className="metric-value">€{totalIncidencia.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change success">Incidência global</span>
        </div>

        <div className="card">
          <span className="metric-label">Total IVA Liquidado</span>
          <strong className="metric-value">€{totalIva.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change success">A entregar ao Estado</span>
        </div>

        <div className="card">
          <span className="metric-label">Retenção Estimada (11.5%)</span>
          <strong className="metric-value">€{retencao115.withholdingAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change">IRS Categoria B</span>
        </div>

        <div className="card">
          <span className="metric-label">Retenção Estimada (25%)</span>
          <strong className="metric-value">€{retencao25.withholdingAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change">IRC / Pessoas Coletivas</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Mapa Discriminado de IVA por Taxa Legal</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Taxa Legal de IVA</th>
              <th>Enquadramento Fiscal</th>
              <th>Base de Incidência (€)</th>
              <th>Montante de IVA (€)</th>
              <th style={{ textAlign: "right" }}>Total Bruto (€)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Taxa Normal (23%)</strong></td>
              <td>Portugal Continental</td>
              <td>€{base23.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td>€{iva23.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: "right" }}>€{(base23 + iva23).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td><strong>Taxa Intermédia (13%)</strong></td>
              <td>Serviços de restauração / materiais específicos</td>
              <td>€{base13.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td>€{iva13.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: "right" }}>€{(base13 + iva13).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td><strong>Taxa Reduzida (6%)</strong></td>
              <td>Reabilitação urbana e mão-de-obra elegível (Verba 2.27 CIVA)</td>
              <td>€{base6.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td>€{iva6.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: "right" }}>€{(base6 + iva6).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td><strong>Isenção (0%)</strong></td>
              <td>Artigo 53.º / Artigo 9.º do CIVA</td>
              <td>€{baseIsenta.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td>€0,00</td>
              <td style={{ textAlign: "right" }}>€{baseIsenta.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
              <td colSpan={2}>Totais Apurados:</td>
              <td>€{totalIncidencia.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td style={{ color: "#15803d" }}>€{totalIva.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: "right" }}>€{(totalIncidencia + totalIva).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
