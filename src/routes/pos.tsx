import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Printer, Search, Trash2, Wallet, CreditCard, Landmark, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — نظام إدارة الصيدلية البيطرية والزراعية" },
      { name: "description", content: "شاشة نقطة بيع متقدمة بدعم الباركود، الخصومات، وطرق دفع متعددة." },
    ],
  }),
  component: POS,
});

type DbProduct = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  stock: number;
  min_stock: number;
  unit: string;
  categories: { name: string } | null;
};
type CartItem = { id: string; name: string; price: number; qty: number; stock: number };

function POS() {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [pay, setPay] = useState<"cash" | "transfer" | "credit">("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ no: number; total: number; items: CartItem[]; tax: number; discount: number } | null>(null);
  const qc = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, barcode, price, stock, min_stock, unit, categories(name)")
        .gt("stock", 0)
        .order("name");
      if (error) throw error;
      return data as unknown as DbProduct[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("pos-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () =>
        qc.invalidateQueries({ queryKey: ["pos-products"] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [qc]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) => !q || p.name.includes(q) || (p.barcode ?? "").includes(q) || (p.categories?.name ?? "").includes(q),
      ),
    [q, products],
  );

  const add = (p: DbProduct) =>
    setCart((c) => {
      const ex = c.find((x) => x.id === p.id);
      if (ex) {
        if (ex.qty + 1 > p.stock) { toast.error("الكمية المطلوبة تتجاوز المخزون"); return c; }
        return c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...c, { id: p.id, name: p.name, price: Number(p.price), qty: 1, stock: p.stock }];
    });

  const setQty = (id: string, qty: number) =>
    setCart((c) => c.flatMap((x) => (x.id === id ? (qty > 0 ? [{ ...x, qty: Math.min(qty, x.stock) }] : []) : [x])));

  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const tax = Math.round(subtotal * 0.15);
  const total = Math.max(0, subtotal + tax - discount);

  const checkout = async () => {
    if (cart.length === 0) return;
    if (pay === "credit" && !customerId) { toast.error("اختر عميلاً للبيع الآجل"); return; }
    setSubmitting(true);
    const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>)("create_invoice", {
      _customer_id: customerId || null,
      _payment_type: pay,
      _discount: discount,
      _tax: tax,
      _notes: null,
      _items: cart.map((c) => ({ product_id: c.id, product_name: c.name, qty: c.qty, price: c.price })),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const { data: inv } = await supabase.from("invoices").select("invoice_no").eq("id", data!).single();
    setLastInvoice({ no: inv?.invoice_no ?? 0, total, items: cart, tax, discount });
    toast.success(`تم إصدار الفاتورة #${inv?.invoice_no}`);
    setCart([]); setDiscount(0); setCustomerId(""); setPay("cash");
    qc.invalidateQueries({ queryKey: ["pos-products"] });
  };

  const printReceipt = () => window.print();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-3 flex flex-col rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  const exact = products.find((p) => p.barcode === q.trim());
                  if (exact) {
                    if (exact.stock <= 0) { toast.error("المنتج غير متوفر بالمخزون"); return; }
                    add(exact); setQ("");
                  } else if (filtered.length === 1) {
                    add(filtered[0]); setQ("");
                  } else if (filtered.length === 0) {
                    toast.error("لم يتم العثور على المنتج / الباركود");
                  }
                }
              }}
              placeholder="مسح الباركود (Enter للإضافة) أو بحث بالاسم..."
              className="w-full rounded-xl border border-input bg-muted/40 py-3 pr-10 pl-3 text-sm outline-none focus:border-primary focus:bg-background transition"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto p-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p)}
              className="group text-right rounded-xl border border-border bg-background p-3 hover:border-primary hover:shadow-elegant transition-all"
            >
              <div className="text-xs text-muted-foreground mb-1">{p.categories?.name ?? "—"}</div>
              <div className="font-semibold text-sm leading-snug line-clamp-2 min-h-10">{p.name}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-primary font-extrabold">{p.price} ر.س</span>
                <span className={`text-[11px] rounded-md px-1.5 py-0.5 ${p.stock < p.min_stock ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  متوفر: {p.stock}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full text-center py-16 text-muted-foreground text-sm">لا توجد منتجات</div>}
        </div>
      </div>

      <div className="lg:col-span-2 flex flex-col rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold">السلة الحالية</h3>
          <button onClick={() => setCart([])} className="text-xs text-destructive hover:underline">إفراغ</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">السلة فارغة — ابدأ بمسح منتج</div>}
          {cart.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm line-clamp-1">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.price} × {item.qty}</div>
                </div>
                <button onClick={() => setQty(item.id, 0)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="inline-flex items-center rounded-lg border border-border">
                  <button className="p-1.5 hover:bg-accent" onClick={() => setQty(item.id, item.qty - 1)}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-9 text-center text-sm font-semibold">{item.qty}</span>
                  <button className="p-1.5 hover:bg-accent" onClick={() => setQty(item.id, item.qty + 1)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <span className="font-extrabold text-primary">{(item.price * item.qty).toLocaleString()} ر.س</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border p-4 space-y-3 bg-muted/30">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">عميل نقدي (بدون تسجيل)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="flex justify-between text-sm"><span>الإجمالي الفرعي</span><span>{subtotal.toLocaleString()} ر.س</span></div>
          <div className="flex justify-between text-sm"><span>الضريبة (15%)</span><span>{tax.toLocaleString()} ر.س</span></div>
          <div className="flex items-center justify-between text-sm">
            <span>خصم</span>
            <input type="number" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex justify-between text-lg font-extrabold border-t border-border pt-3">
            <span>الإجمالي</span><span className="text-primary">{total.toLocaleString()} ر.س</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "cash", label: "نقدي", icon: Wallet },
              { key: "transfer", label: "تحويل", icon: Landmark },
              { key: "credit", label: "آجل", icon: CreditCard },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setPay(key)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs transition ${
                  pay === key ? "border-primary bg-primary/10 text-primary font-bold" : "border-border bg-background hover:bg-accent"
                }`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <button onClick={checkout} disabled={cart.length === 0 || submitting}
            className="w-full rounded-xl bg-gradient-primary py-3 font-bold text-primary-foreground shadow-glow disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            إتمام البيع وطباعة الفاتورة
          </button>
        </div>
      </div>

      {lastInvoice && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-elegant p-6 print:shadow-none print:border-0">
            <div className="text-center mb-4">
              <div className="font-extrabold text-lg">الصيدلية البيطرية والزراعية</div>
              <div className="text-xs text-muted-foreground">فاتورة ضريبية مبسطة</div>
              <div className="text-xs mt-1">#{lastInvoice.no} — {new Date().toLocaleString("ar-SA")}</div>
            </div>
            <div className="border-t border-dashed border-border py-2 space-y-1 text-sm">
              {lastInvoice.items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span className="truncate">{i.name} × {i.qty}</span>
                  <span>{(i.price * i.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>الضريبة</span><span>{lastInvoice.tax}</span></div>
              <div className="flex justify-between"><span>خصم</span><span>{lastInvoice.discount}</span></div>
              <div className="flex justify-between font-extrabold text-base"><span>الإجمالي</span><span>{lastInvoice.total} ر.س</span></div>
            </div>
            <div className="mt-4 flex gap-2 print:hidden">
              <button onClick={printReceipt} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-bold inline-flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> طباعة</button>
              <button onClick={() => setLastInvoice(null)} className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold hover:bg-accent">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
