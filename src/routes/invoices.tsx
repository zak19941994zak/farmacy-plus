import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Printer, Receipt, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "الفواتير — الصيدلية البيطرية والزراعية" }] }),
  component: InvoicesPage,
});

type Invoice = {
  id: string; invoice_no: number; total: number; subtotal: number; tax: number; discount: number;
  payment_type: string; status: string; created_at: string; type: string; parent_invoice_id: string | null;
  customers: { name: string } | null;
};

const PAY_LABEL: Record<string, string> = { cash: "نقدي", transfer: "تحويل", credit: "آجل" };

function InvoicesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, total, subtotal, tax, discount, payment_type, status, created_at, type, parent_invoice_id, customers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("invoices-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => qc.invalidateQueries({ queryKey: ["invoices"] }))
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [qc]);

  const rows = invoices.filter((i) =>
    !q || String(i.invoice_no).includes(q) || (i.customers?.name ?? "").includes(q),
  );
  const todayTotal = invoices.filter((i) => new Date(i.created_at).toDateString() === new Date().toDateString()).reduce((s, i) => s + Number(i.total), 0);
  const monthTotal = invoices.filter((i) => new Date(i.created_at).getMonth() === new Date().getMonth()).reduce((s, i) => s + Number(i.total), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-xs text-muted-foreground">إجمالي الفواتير</div>
          <div className="text-2xl font-extrabold mt-1">{invoices.length}</div>
          <Receipt className="h-5 w-5 text-primary/40 mt-2" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-xs text-muted-foreground">مبيعات اليوم</div>
          <div className="text-2xl font-extrabold mt-1 text-primary">{todayTotal.toLocaleString()} ر.س</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-xs text-muted-foreground">مبيعات الشهر</div>
          <div className="text-2xl font-extrabold mt-1 text-success">{monthTotal.toLocaleString()} ر.س</div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم العميل..."
          className="w-full rounded-xl border border-input bg-card py-2.5 pr-10 pl-3 text-sm outline-none focus:border-primary shadow-soft" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {isLoading ? <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> :
        rows.length === 0 ? <div className="text-center py-20 text-muted-foreground text-sm">لا توجد فواتير</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr>
            <th className="text-right font-medium px-4 py-3">رقم</th>
            <th className="text-right font-medium px-4 py-3">العميل</th>
            <th className="text-right font-medium px-4 py-3">الإجمالي</th>
            <th className="text-right font-medium px-4 py-3">الدفع</th>
            <th className="text-right font-medium px-4 py-3">الحالة</th>
            <th className="text-right font-medium px-4 py-3">التاريخ</th>
            <th className="text-right font-medium px-4 py-3"></th>
          </tr></thead>
          <tbody>{rows.map((i) => {
            const isReturn = i.type === "return";
            const isRefunded = i.status === "refunded";
            return (
            <tr key={i.id} className={`border-t border-border hover:bg-muted/30 ${isReturn ? "bg-destructive/5" : ""}`}>
              <td className="px-4 py-3 font-bold text-primary">#{i.invoice_no}{isReturn && <span className="ms-1 text-[10px] text-destructive">(مرتجع)</span>}</td>
              <td className="px-4 py-3">{i.customers?.name ?? "عميل نقدي"}</td>
              <td className={`px-4 py-3 font-bold ${isReturn ? "text-destructive" : ""}`}>{Number(i.total).toLocaleString()} ر.س</td>
              <td className="px-4 py-3"><span className="rounded-md bg-accent px-2 py-0.5 text-xs">{PAY_LABEL[i.payment_type] ?? i.payment_type}</span></td>
              <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isRefunded ? "bg-destructive/15 text-destructive" : i.status === "paid" ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{isRefunded ? "مرتجعة" : i.status === "paid" ? "مدفوعة" : "غير مدفوعة"}</span></td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(i.created_at).toLocaleString("ar-SA")}</td>
              <td className="px-4 py-3 text-left">
                <div className="inline-flex gap-1">
                  <button onClick={() => setDetail(i.id)} title="عرض" className="rounded-lg p-2 hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  {!isReturn && !isRefunded && (
                    <button onClick={() => handleReturn(i.id, i.invoice_no)} title="إرجاع" className="rounded-lg p-2 hover:bg-destructive/10 text-destructive"><RotateCcw className="h-4 w-4" /></button>
                  )}
                </div>
              </td>
            </tr>
          );})}</tbody>
        </table></div>}
      </div>

      {detail && <InvoiceDetail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function InvoiceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data: inv } = await supabase.from("invoices").select("*, customers(name, phone)").eq("id", id).single();
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
      return { inv, items: items ?? [] };
    },
  });
  if (!data?.inv) return null;
  const inv = data.inv as { invoice_no: number; subtotal: number; tax: number; discount: number; total: number; payment_type: string; created_at: string; customers: { name: string; phone: string | null } | null };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant p-6 print:shadow-none print:border-0">
        <div className="text-center mb-4">
          <div className="font-extrabold text-lg">الصيدلية البيطرية والزراعية</div>
          <div className="text-xs text-muted-foreground">فاتورة ضريبية مبسطة</div>
          <div className="text-xs mt-1">#{inv.invoice_no} — {new Date(inv.created_at).toLocaleString("ar-SA")}</div>
          {inv.customers && <div className="text-xs mt-1">العميل: {inv.customers.name}</div>}
        </div>
        <div className="border-t border-dashed border-border py-2 space-y-1 text-sm">
          {data.items.map((it: { id: string; product_name: string; qty: number; price: number }) => (
            <div key={it.id} className="flex justify-between">
              <span className="truncate">{it.product_name} × {it.qty}</span>
              <span>{(Number(it.price) * Number(it.qty)).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-border pt-2 space-y-1 text-sm">
          <div className="flex justify-between"><span>الإجمالي الفرعي</span><span>{Number(inv.subtotal).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>الضريبة</span><span>{Number(inv.tax).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>الخصم</span><span>{Number(inv.discount).toLocaleString()}</span></div>
          <div className="flex justify-between font-extrabold text-base"><span>الإجمالي</span><span>{Number(inv.total).toLocaleString()} ر.س</span></div>
        </div>
        <div className="mt-4 flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-bold inline-flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> طباعة</button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold hover:bg-accent">إغلاق</button>
        </div>
      </div>
    </div>
  );
}
