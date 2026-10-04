"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type View = "overview" | "catalog" | "pricing" | "stock" | "reports" | "public";

type Item = {
  item_id: number;
  current_price: number;
  current_cost: number | null;
  current_stock_qty: number | null;
  reorder_level: number | null;
  price_updated_at: string;
  status: string;
  product: {
    product_name: string;
    brand: string | null;
    category: { category_name: string } | null;
  } | null;
};

type PriceChange = {
  log_id: number;
  old_price: number;
  new_price: number;
  changed_at: string;
  reason: string | null;
  item: { product: { product_name: string } | null } | null;
  staff_account: { full_name: string } | null;
};

type Movement = {
  movement_id: number;
  movement_type: string;
  quantity: number;
  moved_at: string;
  item: { product: { product_name: string } | null } | null;
  staff_account: { full_name: string } | null;
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    box: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9",
    tag: "m20 13-7 7-10-10V4h6l11 9ZM7.5 8.5h.01",
    bars: "M5 20V10M12 20V4M19 20v-7",
    chart: "M4 19V5M4 19h16M7 15l3-4 3 2 4-6",
    search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    plus: "M12 5v14M5 12h14",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  };
  return <svg viewBox="0 0 24 24" className="icon"><path d={paths[name]} /></svg>;
}

function money(value: number | null | undefined) {
  return value == null ? "—" : `₱${Number(value).toFixed(2)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [smeName, setSmeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");

      const [smeResult, itemResult, priceResult, movementResult] = await Promise.all([
        supabase.from("sme").select("sme_name").eq("status", "Active").limit(1).maybeSingle(),
        supabase.from("item").select("item_id,current_price,current_cost,current_stock_qty,reorder_level,price_updated_at,status,product:product_id(product_name,brand,category:category_id(category_name))").eq("status", "Active").order("item_id"),
        supabase.from("price_change_log").select("log_id,old_price,new_price,changed_at,reason,item:item_id(product:product_id(product_name)),staff_account:staff_account_id(full_name)").order("changed_at", { ascending: false }).limit(100),
        supabase.from("stock_movement").select("movement_id,movement_type,quantity,moved_at,item:item_id(product:product_id(product_name)),staff_account:staff_account_id(full_name)").order("moved_at", { ascending: false }).limit(100),
      ]);

      if (!mounted) return;
      const firstError = smeResult.error || itemResult.error || priceResult.error || movementResult.error;
      if (firstError) setError(firstError.message);
      setSmeName(smeResult.data?.sme_name ?? "");
      setItems((itemResult.data ?? []) as unknown as Item[]);
      setPriceChanges((priceResult.data ?? []) as unknown as PriceChange[]);
      setMovements((movementResult.data ?? []) as unknown as Movement[]);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [item.product?.product_name, item.product?.brand, item.product?.category?.category_name].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [items, query]);

  const lowStock = items.filter((item) => item.current_stock_qty != null && item.reorder_level != null && item.current_stock_qty <= item.reorder_level);
  const outOfStock = items.filter((item) => item.current_stock_qty === 0);
  const activeItems = items.length;
  const recentPriceChanges = priceChanges.filter((row) => Date.now() - new Date(row.changed_at).getTime() <= 7 * 86400000);
  const recentMovements = movements.filter((row) => Date.now() - new Date(row.moved_at).getTime() <= 86400000);
  const totalStock = items.reduce((sum, item) => sum + (item.current_stock_qty ?? 0), 0);
  const marginItems = items.filter((item) => item.current_cost != null && item.current_price > 0);
  const avgMargin = marginItems.length ? marginItems.reduce((sum, item) => sum + ((item.current_price - Number(item.current_cost)) / item.current_price) * 100, 0) / marginItems.length : null;
  const unitsMoved = movements.reduce((sum, movement) => sum + movement.quantity, 0);

  const nav: Array<[View, string, string]> = [
    ["overview", "Overview", "grid"],
    ["catalog", "Catalog & Items", "box"],
    ["pricing", "Pricing", "tag"],
    ["stock", "Stock", "bars"],
    ["reports", "Reports", "chart"],
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SME MIS</strong><span>Price & Stock Control</span></div></div>
        <nav>
          <p className="nav-label">Workspace</p>
          {nav.map(([id, label, icon]) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)}><Icon name={icon} /><span>{label}</span></button>)}
          <p className="nav-label nav-gap">Customer</p>
          <button className={view === "public" ? "nav-item active" : "nav-item"} onClick={() => setView("public")}><Icon name="search" /><span>Public Price Lookup</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="store-mini"><i className="status-dot" /><div><strong>{smeName || "No business"}</strong><small>{smeName ? "Active business" : "Create an SME record to begin"}</small></div></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="mobile-brand"><div className="brand-mark">S</div><strong>SME MIS</strong></div><div className="crumb">{smeName || "No business"} <span>/</span> {view === "public" ? "Public Price Lookup" : nav.find((n) => n[0] === view)?.[1]}</div><div className="top-actions"><button className="icon-button"><Icon name="bell" /></button></div></header>
        <div className="page">
          {error && <div className="error-banner">Unable to load live data: {error}</div>}
          {loading ? <div className="loading-state">Loading live SME MIS data…</div> : <>
            {view === "overview" && <Overview setView={setView} activeItems={activeItems} priceChanges={recentPriceChanges.length} lowStock={lowStock.length} outOfStock={outOfStock.length} movements={recentMovements} lowItems={lowStock} />}
            {view === "catalog" && <Catalog filtered={filtered} query={query} setQuery={setQuery} />}
            {view === "pricing" && <Pricing priceChanges={priceChanges} />}
            {view === "stock" && <Stock movements={movements} totalStock={totalStock} lowStock={lowStock.length} />}
            {view === "reports" && <Reports avgMargin={avgMargin} unitsMoved={unitsMoved} priceChanges={priceChanges.length} items={activeItems} />}
            {view === "public" && <PublicLookup items={items} query={query} setQuery={setQuery} />}
          </>}
        </div>
      </section>
    </main>
  );
}

function Overview({ setView, activeItems, priceChanges, lowStock, outOfStock, movements, lowItems }: { setView: (v: View) => void; activeItems: number; priceChanges: number; lowStock: number; outOfStock: number; movements: Movement[]; lowItems: Item[] }) {
  return <><div className="hero-row"><div><p className="eyebrow">STORE OVERVIEW</p><h1>{activeItems ? "Live store overview" : "No store data yet"}</h1><p className="muted">Only records currently stored in Supabase are shown here.</p></div></div>
    <div className="metric-grid"><Metric label="Active items" value={activeItems} detail="From item records" /><Metric label="Price changes" value={priceChanges} detail="Last 7 days" /><Metric label="Low stock" value={lowStock} detail="At or below reorder level" warning={lowStock > 0} /><Metric label="Out of stock" value={outOfStock} detail="Current stock quantity is zero" /></div>
    <div className="dashboard-grid"><section className="panel"><Head title="Recent stock activity" sub="From stock_movement records" action="View stock" onClick={() => setView("stock")} />{movements.length ? <div className="movement-list">{movements.map((m) => <Movement key={m.movement_id} m={m} />)}</div> : <Empty>No stock movements have been recorded.</Empty>}</section>
      <section className="panel"><Head title="Stock alerts" sub="Calculated from item stock and reorder levels" />{lowItems.length ? <div className="alert-list">{lowItems.map((item) => <Alert key={item.item_id} item={item} />)}</div> : <Empty>No low-stock items.</Empty>}<button className="secondary full" onClick={() => setView("stock")}>Review stock</button></section></div>
  </>;
}

function Head({ title, sub, action, onClick }: { title: string; sub: string; action?: string; onClick?: () => void }) {
  return <div className="panel-head"><div><h2>{title}</h2><p>{sub}</p></div>{action && <button className="text-button" onClick={onClick}>{action}<Icon name="arrow" /></button>}</div>;
}

function Metric({ label, value, detail, warning }: { label: string; value: number | string; detail: string; warning?: boolean }) {
  return <div className="metric"><div className="metric-icon"><Icon name={warning ? "bell" : "box"} /></div><span>{label}</span><strong>{value}</strong><small className={warning ? "warn" : ""}>{detail}</small></div>;
}

function Movement({ m }: { m: Movement }) {
  return <div className="movement"><span className="time">{formatDate(m.moved_at)}</span><span className={"movement-type " + m.movement_type.toLowerCase()}>{m.movement_type}</span><div className="movement-name"><strong>{m.item?.product?.product_name || "Unknown item"}</strong><small>Recorded by {m.staff_account?.full_name || "Unknown staff"}</small></div><strong className={m.movement_type === "RESTOCK" ? "positive" : "negative"}>{m.movement_type === "RESTOCK" ? "+" : "-"}{m.quantity}</strong></div>;
}

function Alert({ item }: { item: Item }) {
  const stock = item.current_stock_qty ?? 0;
  return <div className="alert"><i className="alert-dot" /><div><strong>{item.product?.product_name || "Unnamed product"}</strong><small>{stock === 0 ? "Out of stock" : `${stock} left`}</small></div></div>;
}

function Catalog({ filtered, query, setQuery }: { filtered: Item[]; query: string; setQuery: (v: string) => void }) {
  return <><div className="hero-row"><div><p className="eyebrow">ITEM MASTER</p><h1>Catalog & Items</h1><p className="muted">Live PRODUCT and ITEM records from Supabase.</p></div></div>
    <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, brand, or category" /></div></div>
    <section className="panel table-panel"><Head title="Items" sub={`${filtered.length} showing`} />{filtered.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead><tbody>{filtered.map((item) => {
      const status = item.current_stock_qty === 0 ? "Out of stock" : item.reorder_level != null && (item.current_stock_qty ?? 0) <= item.reorder_level ? "Low stock" : "In stock";
      return <tr key={item.item_id}><td><strong>{item.product?.product_name || "Unnamed product"}</strong><small>{item.product?.brand || "No brand"}</small></td><td>{item.product?.category?.category_name || "—"}</td><td><strong>{money(item.current_price)}</strong></td><td>{item.current_stock_qty ?? "—"}</td><td><span className={"status " + status.toLowerCase().replaceAll(" ", "-")}>{status}</span></td></tr>;
    })}</tbody></table></div> : <Empty>No active items are stored in Supabase.</Empty>}</section></>;
}

function Pricing({ priceChanges }: { priceChanges: PriceChange[] }) {
  return <><div className="hero-row"><div><p className="eyebrow">PRICE CONTROL</p><h1>Pricing</h1><p className="muted">Price history is read from price_change_log; nothing is fabricated for the dashboard.</p></div></div>
    <div className="metric-grid three"><Metric label="Changes this week" value={priceChanges.filter((r) => Date.now() - new Date(r.changed_at).getTime() <= 7 * 86400000).length} detail="Recorded changes" /><Metric label="Logged changes" value={priceChanges.length} detail="Loaded from database" /><Metric label="Latest change" value={priceChanges[0] ? money(priceChanges[0].new_price) : "—"} detail={priceChanges[0] ? formatDate(priceChanges[0].changed_at) : "No price changes recorded"} /></div>
    <section className="panel table-panel"><Head title="Price changes" sub="Permanent audit trail" />{priceChanges.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Previous</th><th>New price</th><th>Changed</th><th>By</th><th>Reason</th></tr></thead><tbody>{priceChanges.map((r) => <tr key={r.log_id}><td><strong>{r.item?.product?.product_name || "Unknown item"}</strong></td><td>{money(r.old_price)}</td><td><strong>{money(r.new_price)}</strong></td><td>{formatDate(r.changed_at)}</td><td>{r.staff_account?.full_name || "Unknown staff"}</td><td>{r.reason || "—"}</td></tr>)}</tbody></table></div> : <Empty>No price changes have been recorded.</Empty>}</section></>;
}

function Stock({ movements, totalStock, lowStock }: { movements: Movement[]; totalStock: number; lowStock: number }) {
  return <><div className="hero-row"><div><p className="eyebrow">STOCK CONTROL</p><h1>Stock</h1><p className="muted">Stock figures and movement history come directly from item and stock_movement records.</p></div></div>
    <div className="metric-grid three"><Metric label="On hand" value={totalStock} detail="Sum of current item quantities" /><Metric label="Low stock" value={lowStock} detail="At or below reorder level" warning={lowStock > 0} /><Metric label="Recorded movements" value={movements.length} detail="Loaded movement history" /></div>
    <section className="panel"><Head title="Movement history" sub="Permanent operational trail" />{movements.length ? <div className="movement-list">{movements.map((m) => <Movement key={m.movement_id} m={m} />)}</div> : <Empty>No stock movements have been recorded.</Empty>}</section></>;
}

function Reports({ avgMargin, unitsMoved, priceChanges, items }: { avgMargin: number | null; unitsMoved: number; priceChanges: number; items: number }) {
  const hasData = items > 0 || unitsMoved > 0 || priceChanges > 0;
  return <><div className="hero-row"><div><p className="eyebrow">INSIGHTS</p><h1>Reports</h1><p className="muted">Calculated only from stored SME MIS records. No sample metrics or synthetic charts.</p></div></div>
    {!hasData ? <section className="panel"><Empty>No report data is available yet. Add items, price changes, or stock movements to generate live management indicators.</Empty></section> :
      <div className="report-grid"><Report title="Average gross margin" value={avgMargin == null ? "—" : `${avgMargin.toFixed(1)}%`} detail={avgMargin == null ? "Requires item cost data" : "Average across items with cost and price"} /><Report title="Units moved" value={unitsMoved.toLocaleString()} detail="Sum of recorded stock movements" /><Report title="Price changes" value={priceChanges.toLocaleString()} detail="Total loaded price-change records" /><Report title="Active items" value={items.toLocaleString()} detail="Active item records" /></div>}
  </>;
}

function Report({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <section className="panel report-card"><span>{title}</span><strong>{value}</strong><small>{detail}</small></section>;
}

function PublicLookup({ items, query, setQuery }: { items: Item[]; query: string; setQuery: (v: string) => void }) {
  const filtered = items.filter((item) => [item.product?.product_name, item.product?.brand, item.product?.barcode].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <><div className="public-head"><div className="public-logo"><div className="brand-mark">S</div><strong>SME MIS</strong><span>Price lookup</span></div><h1>Current listed prices.</h1><p className="muted">Only active ITEM records stored in Supabase are displayed.</p></div>
    <div className="public-search search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a product, brand, or barcode" /></div>
    <div className="lookup-grid">{filtered.length ? filtered.map((item) => <article className="lookup-card" key={item.item_id}><div className="product-thumb">{(item.product?.product_name || "?")[0]}</div><div className="lookup-info"><span>{item.product?.category?.category_name || "Uncategorized"}</span><h2>{item.product?.product_name || "Unnamed product"}</h2><p>{item.product?.brand || "No brand"}</p><strong>{money(item.current_price)}</strong><small>Updated {formatDate(item.price_updated_at)} · {item.current_stock_qty === 0 ? "Out of stock" : "Available"}</small></div></article>) : <Empty>No active items match this lookup.</Empty>}</div></>;
}
