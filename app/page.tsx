"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PublicPriceLookup from "@/components/public-price-lookup";

type View = "overview" | "catalog" | "pricing" | "stock" | "reports" | "public";
type Role = "Owner" | "Manager" | "Staff";

type Staff = {
  staff_account_id: number;
  sme_id: number;
  role: Role;
  full_name: string;
  status: string;
};

type Sme = {
  sme_id: number;
  sme_name: string;
  region: string | null;
  province: string | null;
  city_municipality: string | null;
  barangay: string | null;
  cost_module_enabled: boolean;
  stock_module_enabled: boolean;
  sales_log_enabled: boolean;
  scan_enabled: boolean;
};

type Category = {
  category_id: number;
  category_name: string;
};

type Product = {
  product_id: number;
  category_id: number;
  product_name: string;
  normalized_name: string;
  brand: string | null;
  barcode: string | null;
  category: { category_name: string } | null;
};

type Item = {
  item_id: number;
  product_id: number;
  current_price: number;
  current_cost: number | null;
  current_stock_qty: number | null;
  reorder_level: number | null;
  shelf_location: string | null;
  barcode_qr_value: string | null;
  price_updated_at: string;
  status: string;
  product: {
    product_name: string;
    brand: string | null;
    barcode: string | null;
    category: { category_name: string } | null;
  } | null;
};

type PriceChange = {
  log_id: number;
  old_price: number;
  new_price: number;
  changed_at: string;
  reason: string | null;
  is_correction: boolean;
  item: { product: { product_name: string } | null } | null;
  staff_account: { full_name: string } | null;
};

type Movement = {
  movement_id: number;
  movement_type: string;
  quantity: number;
  moved_at: string;
  item: { item_id: number; product: { product_name: string } | null } | null;
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
    logout: "M10 17l5-5-5-5M15 12H3M20 5v14",
  };
  return <svg viewBox="0 0 24 24" className="icon"><path d={paths[name]} /></svg>;
}

function money(value: number | null | undefined) {
  return value == null ? "—" : `₱${Number(value).toFixed(2)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function normalizeProductName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return message ? <div className="error-banner">{message}</div> : null;
}

export default function Home() {
  const [view, setView] = useState<View>("public");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [sme, setSme] = useState<Sme | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  async function loadWorkspace(userId: string) {
    const supabase = createClient();
    setWorkspaceLoading(true);
    setError("");

    const { data: staffRow, error: staffError } = await supabase
      .from("staff_account")
      .select("staff_account_id,sme_id,role,full_name,status")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (staffError) {
      setError(staffError.message);
      setWorkspaceLoading(false);
      return;
    }

    if (!staffRow) {
      setStaff(null);
      setSme(null);
      setItems([]);
      setPriceChanges([]);
      setMovements([]);
      setProducts([]);
      setCategories([]);
      setWorkspaceLoading(false);
      return;
    }

    const [smeResult, itemResult, priceResult, movementResult, productResult, categoryResult] = await Promise.all([
      supabase.from("sme").select("sme_id,sme_name,region,province,city_municipality,barangay,cost_module_enabled,stock_module_enabled,sales_log_enabled,scan_enabled").eq("sme_id", staffRow.sme_id).single(),
      supabase.from("item").select("item_id,product_id,current_price,current_cost,current_stock_qty,reorder_level,shelf_location,barcode_qr_value,price_updated_at,status,product:product_id(product_name,brand,barcode,category:category_id(category_name))").eq("sme_id", staffRow.sme_id).eq("status", "Active").order("item_id"),
      supabase.from("price_change_log").select("log_id,old_price,new_price,changed_at,reason,is_correction,item:item_id(product:product_id(product_name)),staff_account:staff_account_id(full_name)").eq("sme_id", staffRow.sme_id).order("changed_at", { ascending: false }).limit(200),
      supabase.from("stock_movement").select("movement_id,movement_type,quantity,moved_at,item:item_id(item_id,product:product_id(product_name)),staff_account:staff_account_id(full_name)").order("moved_at", { ascending: false }).limit(200),
      supabase.from("product").select("product_id,category_id,product_name,normalized_name,brand,barcode,category:category_id(category_name)").order("product_name"),
      supabase.from("category").select("category_id,category_name").order("category_name"),
    ]);

    const firstError = smeResult.error || itemResult.error || priceResult.error || movementResult.error || productResult.error || categoryResult.error;
    if (firstError) setError(firstError.message);

    setStaff(staffRow as Staff);
    setSme((smeResult.data ?? null) as Sme | null);
    setItems((itemResult.data ?? []) as unknown as Item[]);
    setPriceChanges((priceResult.data ?? []) as unknown as PriceChange[]);
    setMovements((movementResult.data ?? []) as unknown as Movement[]);
    setProducts((productResult.data ?? []) as unknown as Product[]);
    setCategories((categoryResult.data ?? []) as unknown as Category[]);
    setWorkspaceLoading(false);
  }

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const nextUser = data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null;
      setUser(nextUser);
      if (nextUser) {
        setView("overview");
        await loadWorkspace(nextUser.id);
      }
      setAuthReady(true);
    }

    void bootstrap();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null;
      setUser(nextUser);
      if (nextUser) {
        setView("overview");
        window.setTimeout(() => void loadWorkspace(nextUser.id), 0);
      } else {
        setStaff(null);
        setSme(null);
        setItems([]);
        setPriceChanges([]);
        setMovements([]);
        setProducts([]);
        setCategories([]);
      }
    });

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.product?.product_name, item.product?.brand, item.product?.barcode, item.product?.category?.category_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setView("public");
  }

  const canManage = staff?.role === "Owner" || staff?.role === "Manager";

  if (!authReady) {
    return <main className="auth-shell"><div className="loading-state">Connecting to SME MIS…</div></main>;
  }

  if (!user) {
    if (view === "public") {
      return (
        <main className="public-shell">
          <header className="public-topbar">
            <div className="brand"><div className="brand-mark">S</div><div><strong>SME MIS</strong><span>Price & Stock Control</span></div></div>
            <button className="primary" onClick={() => setView("overview")}>Staff sign in</button>
          </header>
          <PublicPriceLookup />
        </main>
      );
    }
    return <AuthScreen mode={authMode} setMode={setAuthMode} setView={setView} setUser={(next) => setUser(next)} setMessage={setMessage} error={authError} setError={setAuthError} message={message} />;
  }

  if (!staff) {
    return <SetupScreen userEmail={user.email ?? ""} setMessage={setMessage} message={message} setError={setError} error={error} onComplete={() => void loadWorkspace(user.id)} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SME MIS</strong><span>Price & Stock Control</span></div></div>
        <nav>
          <p className="nav-label">Workspace</p>
          {([
            ["overview", "Overview", "grid"],
            ["catalog", "Catalog & Items", "box"],
            ["pricing", "Pricing", "tag"],
            ["stock", "Stock", "bars"],
            ["reports", "Reports", "chart"],
          ] as Array<[View, string, string]>).map(([id, label, icon]) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)}>
              <Icon name={icon} /><span>{label}</span>
            </button>
          ))}
          <p className="nav-label nav-gap">Customer</p>
          <button className={view === "public" ? "nav-item active" : "nav-item"} onClick={() => setView("public")}><Icon name="search" /><span>Public Price Lookup</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="store-mini"><i className="status-dot" /><div><strong>{sme?.sme_name || "No business"}</strong><small>{staff.full_name} · {staff.role}</small></div></div>
          <button className="logout-button" onClick={() => void signOut()}><Icon name="logout" /> Sign out</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark">S</div><strong>SME MIS</strong></div>
          <div className="crumb">{sme?.sme_name || "Business"} <span>/</span> {view === "public" ? "Public Price Lookup" : view === "catalog" ? "Catalog & Items" : view[0].toUpperCase() + view.slice(1)}</div>
          <div className="top-actions"><span className="role-badge">{staff.role}</span><button className="icon-button" onClick={() => setView("public")}><Icon name="search" /></button></div>
        </header>

        <div className="page">
          <ErrorBanner message={error} />
          {workspaceLoading ? <div className="loading-state">Loading live SME MIS data…</div> : <>
            {view === "overview" && <Overview sme={sme} setView={setView} items={items} priceChanges={priceChanges} movements={movements} />}
            {view === "catalog" && <Catalog items={filtered} query={query} setQuery={setQuery} products={products} categories={categories} canManage={canManage} onSaved={() => void loadWorkspace(user.id)} />}
            {view === "pricing" && <Pricing items={items} priceChanges={priceChanges} canManage={canManage} onSaved={() => void loadWorkspace(user.id)} />}
            {view === "stock" && <Stock items={items} movements={movements} stockEnabled={Boolean(sme?.stock_module_enabled)} onSaved={() => void loadWorkspace(user.id)} />}
            {view === "reports" && <Reports items={items} movements={movements} priceChanges={priceChanges} />}
            {view === "public" && <PublicPriceLookup />}
          </>}
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ mode, setMode, setView, setUser, setMessage, error, setError, message }: {
  mode: "signin" | "signup";
  setMode: (value: "signin" | "signup") => void;
  setView: (value: View) => void;
  setUser: (value: { id: string; email?: string } | null) => void;
  setMessage: (value: string) => void;
  error: string;
  setError: (value: string) => void;
  message: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();

    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });

    if (result.error) {
      setError(result.error.message);
    } else if (!result.data.session && mode === "signup") {
      setMessage("Account created. Check your email if Supabase requires email confirmation, then sign in to finish the SME setup.");
    } else if (result.data.user) {
      setUser({ id: result.data.user.id, email: result.data.user.email ?? undefined });
      setMessage(mode === "signup" ? "Account created. Finish the SME setup next." : "");
    }
    setBusy(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand"><div className="brand-mark">S</div><div><strong>SME MIS</strong><span>Price & Stock Control</span></div></div>
        <p className="eyebrow">{mode === "signin" ? "STAFF ACCESS" : "NEW SME ACCOUNT"}</p>
        <h1>{mode === "signin" ? "Sign in to your store workspace." : "Create an Owner account."}</h1>
        <p className="muted">Your staff identity is separate from public customer data.</p>
        <form className="form-stack" onSubmit={submit}>
          <label><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label><span>Password</span><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <button className="primary full" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <div className="auth-links">
          <button className="text-button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
            {mode === "signin" ? "Create an Owner account" : "Back to sign in"}
          </button>
          <button className="text-button" onClick={() => setView("public")}>Browse public prices</button>
        </div>
      </section>
    </main>
  );
}

function SetupScreen({ userEmail, onComplete, setMessage, message, setError, error }: {
  userEmail: string;
  onComplete: () => void;
  setMessage: (value: string) => void;
  message: string;
  setError: (value: string) => void;
  error: string;
}) {
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [barangay, setBarangay] = useState("");
  const [costModule, setCostModule] = useState(true);
  const [stockModule, setStockModule] = useState(true);
  const [salesModule, setSalesModule] = useState(true);
  const [scanModule, setScanModule] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();

    const { data, error: registerError } = await supabase.rpc("register_sme_owner", {
      p_sme_name: businessName.trim(),
      p_region: region.trim() || null,
      p_province: province.trim() || null,
      p_city_municipality: city.trim() || null,
      p_barangay: barangay.trim() || null,
      p_full_name: fullName.trim(),
    });

    if (registerError) {
      setError(registerError.message);
      setBusy(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.sme_id) {
      setError("The SME account could not be created.");
      setBusy(false);
      return;
    }

    const { error: moduleError } = await supabase.from("sme").update({
      cost_module_enabled: costModule,
      stock_module_enabled: stockModule,
      sales_log_enabled: salesModule,
      scan_enabled: scanModule,
    }).eq("sme_id", row.sme_id);

    if (moduleError) {
      setError(moduleError.message);
      setBusy(false);
      return;
    }

    setMessage(`Business created for ${userEmail}. Your Owner workspace is ready.`);
    setBusy(false);
    onComplete();
  }

  return (
    <main className="auth-shell">
      <section className="setup-card">
        <div className="brand auth-brand"><div className="brand-mark">S</div><div><strong>SME MIS</strong><span>First-time Owner setup</span></div></div>
        <p className="eyebrow">BUSINESS REGISTRATION</p>
        <h1>Set up your SME workspace.</h1>
        <p className="muted">{userEmail}</p>
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            <label><span>Business name</span><input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></label>
            <label><span>Owner / display name</span><input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
            <label><span>Region</span><input value={region} onChange={(e) => setRegion(e.target.value)} /></label>
            <label><span>Province</span><input value={province} onChange={(e) => setProvince(e.target.value)} /></label>
            <label><span>City / Municipality</span><input value={city} onChange={(e) => setCity(e.target.value)} /></label>
            <label><span>Barangay</span><input value={barangay} onChange={(e) => setBarangay(e.target.value)} /></label>
          </div>
          <div>
            <p className="form-section-title">Optional modules</p>
            <div className="module-grid">
              <label className="module-toggle"><input type="checkbox" checked={costModule} onChange={(e) => setCostModule(e.target.checked)} /><span>Cost & margin</span></label>
              <label className="module-toggle"><input type="checkbox" checked={stockModule} onChange={(e) => setStockModule(e.target.checked)} /><span>Stock tracking</span></label>
              <label className="module-toggle"><input type="checkbox" checked={salesModule} onChange={(e) => setSalesModule(e.target.checked)} /><span>Sales logging</span></label>
              <label className="module-toggle"><input type="checkbox" checked={scanModule} onChange={(e) => setScanModule(e.target.checked)} /><span>Barcode / QR</span></label>
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <button className="primary full" disabled={busy}>{busy ? "Creating workspace…" : "Create SME workspace"}</button>
        </form>
      </section>
    </main>
  );
}

function Overview({ sme, setView, items, priceChanges, movements }: { sme: Sme | null; setView: (v: View) => void; items: Item[]; priceChanges: PriceChange[]; movements: Movement[] }) {
  const lowStock = items.filter((item) => item.current_stock_qty != null && item.reorder_level != null && item.current_stock_qty <= item.reorder_level);
  const outOfStock = items.filter((item) => item.current_stock_qty === 0);
  const recentChanges = priceChanges.filter((row) => Date.now() - new Date(row.changed_at).getTime() <= 7 * 86400000);
  const recentMovements = movements.filter((row) => Date.now() - new Date(row.moved_at).getTime() <= 86400000);

  return <>
    <div className="hero-row"><div><p className="eyebrow">STORE OVERVIEW</p><h1>{sme?.sme_name || "Live store overview"}</h1><p className="muted">Operational indicators are calculated from records stored in Supabase.</p></div></div>
    <div className="metric-grid">
      <Metric label="Active items" value={items.length} detail="Current item listings" />
      <Metric label="Price changes" value={recentChanges.length} detail="Last 7 days" />
      <Metric label="Low stock" value={lowStock.length} detail="At or below reorder level" warning={lowStock.length > 0} />
      <Metric label="Out of stock" value={outOfStock.length} detail="Current stock is zero" />
    </div>
    <div className="module-status panel">
      <div><strong>Modules</strong><span>Owner configuration</span></div>
      <div className="module-pills">
        <span className={sme?.cost_module_enabled ? "module-pill on" : "module-pill"}>Cost</span>
        <span className={sme?.stock_module_enabled ? "module-pill on" : "module-pill"}>Stock</span>
        <span className={sme?.sales_log_enabled ? "module-pill on" : "module-pill"}>Sales</span>
        <span className={sme?.scan_enabled ? "module-pill on" : "module-pill"}>Scan</span>
      </div>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><Head title="Recent stock activity" sub="Last 24 hours from stock_movement" action="View stock" onClick={() => setView("stock")} />{recentMovements.length ? <div className="movement-list">{recentMovements.map((m) => <Movement key={m.movement_id} m={m} />)}</div> : <Empty>No stock movements have been recorded.</Empty>}</section>
      <section className="panel"><Head title="Stock alerts" sub="Calculated from current stock and reorder level" />{lowStock.length ? <div className="alert-list">{lowStock.map((item) => <Alert key={item.item_id} item={item} />)}</div> : <Empty>No low-stock items.</Empty>}<button className="secondary full" onClick={() => setView("stock")}>Review stock</button></section>
    </div>
  </>;
}

function Catalog({ items, query, setQuery, products, categories, canManage, onSaved }: { items: Item[]; query: string; setQuery: (v: string) => void; products: Product[]; categories: Category[]; canManage: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);

  return <>
    <div className="hero-row"><div><p className="eyebrow">ITEM MASTER</p><h1>Catalog & Items</h1><p className="muted">PRODUCT is shared; ITEM is this SME's listing with its current price, cost and stock.</p></div>{canManage && <button className="primary" onClick={() => setOpen(true)}><Icon name="plus" />Add item</button>}</div>
    <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, brand, category, or barcode" /></div></div>
    {open && <AddItemForm products={products} categories={categories} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />}
    <section className="panel table-panel">
      <Head title="Items" sub={`${items.length} active item listing${items.length === 1 ? "" : "s"}`} />
      {items.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Location</th><th>State</th></tr></thead><tbody>{items.map((item) => {
        const state = item.current_stock_qty === 0 ? "Out of stock" : item.reorder_level != null && (item.current_stock_qty ?? 0) <= item.reorder_level ? "Low stock" : "In stock";
        return <tr key={item.item_id}><td><strong>{item.product?.product_name || "Unnamed product"}</strong><small>{item.product?.brand || "No brand"}{item.product?.barcode ? ` · ${item.product.barcode}` : ""}</small></td><td>{item.product?.category?.category_name || "—"}</td><td><strong>{money(item.current_price)}</strong><small>Updated {formatDate(item.price_updated_at)}</small></td><td>{money(item.current_cost)}</td><td>{item.current_stock_qty ?? "—"}{item.reorder_level != null && <small>reorder {item.reorder_level}</small>}</td><td>{item.shelf_location || "—"}</td><td><span className={"status " + state.toLowerCase().replaceAll(" ", "-")}>{state}</span></td></tr>;
      })}</tbody></table></div> : <Empty>No active items are stored in Supabase.</Empty>}
    </section>
  </>;
}

function AddItemForm({ products, categories, onClose, onSaved }: { products: Product[]; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [reorder, setReorder] = useState("");
  const [shelf, setShelf] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();

    try {
      let finalProductId = Number(productId);

      if (mode === "new") {
        if (!productName.trim()) throw new Error("Product name is required.");
        let finalCategoryId = Number(categoryId);
        if (!finalCategoryId && newCategory.trim()) {
          const categoryResult = await supabase.from("category").insert({ category_name: newCategory.trim() }).select("category_id").single();
          if (categoryResult.error) throw new Error(categoryResult.error.message);
          finalCategoryId = categoryResult.data.category_id;
        }
        if (!finalCategoryId) throw new Error("Choose or create a category.");

        const productResult = await supabase.from("product").insert({
          category_id: finalCategoryId,
          product_name: productName.trim(),
          normalized_name: normalizeProductName(productName),
          brand: brand.trim() || null,
          barcode: barcode.trim() || null,
        }).select("product_id").single();
        if (productResult.error) throw new Error(productResult.error.message);
        finalProductId = productResult.data.product_id;
      }

      if (!finalProductId) throw new Error("Choose a product.");

      const result = await supabase.rpc("create_item", {
        p_product_id: finalProductId,
        p_current_price: Number(price),
        p_current_cost: cost === "" ? null : Number(cost),
        p_current_stock_qty: stock === "" ? null : Number(stock),
        p_reorder_level: reorder === "" ? null : Number(reorder),
        p_shelf_location: shelf.trim() || null,
        p_barcode_qr_value: qr.trim() || null,
      });
      if (result.error) throw new Error(result.error.message);

      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create item.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel form-panel">
    <div className="panel-head"><div><h2>Add item</h2><p>Create a shared product or list an existing product for this SME.</p></div><button className="secondary" onClick={onClose}>Close</button></div>
    <div className="segmented"><button className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>New product</button><button className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>Existing product</button></div>
    <form className="form-stack" onSubmit={submit}>
      {mode === "existing" ? <label><span>Product</span><select required value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Select product…</option>{products.map((product) => <option key={product.product_id} value={product.product_id}>{product.product_name}{product.brand ? ` · ${product.brand}` : ""}</option>)}</select></label> :
        <div className="form-grid">
          <label><span>Product name</span><input required value={productName} onChange={(e) => setProductName(e.target.value)} /></label>
          <label><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
          <label><span>Barcode</span><input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></label>
          <label><span>Category</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Select category…</option>{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select></label>
          <label><span>Or new category</span><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></label>
        </div>}
      <div className="form-grid">
        <label><span>Current price</span><input required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label><span>Current cost</span><input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label><span>Opening stock</span><input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></label>
        <label><span>Reorder level</span><input type="number" min="0" step="1" value={reorder} onChange={(e) => setReorder(e.target.value)} /></label>
        <label><span>Shelf location</span><input value={shelf} onChange={(e) => setShelf(e.target.value)} /></label>
        <label><span>Barcode / QR value</span><input value={qr} onChange={(e) => setQr(e.target.value)} /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Saving item…" : "Create item"}</button>
    </form>
  </section>;
}

function Pricing({ items, priceChanges, canManage, onSaved }: { items: Item[]; priceChanges: PriceChange[]; canManage: boolean; onSaved: () => void }) {
  const [selected, setSelected] = useState<Item | null>(null);
  return <>
    <div className="hero-row"><div><p className="eyebrow">PRICE CONTROL</p><h1>Pricing</h1><p className="muted">Every price change writes a permanent attributable history entry.</p></div></div>
    <div className="metric-grid three"><Metric label="Changes this week" value={priceChanges.filter((r) => Date.now() - new Date(r.changed_at).getTime() <= 7 * 86400000).length} detail="Recorded changes" /><Metric label="Logged changes" value={priceChanges.length} detail="Loaded from database" /><Metric label="Current items" value={items.length} detail="Active item listings" /></div>
    {canManage && <section className="panel"><Head title="Change a price" sub="Owner and Manager only" />{items.length ? <div className="action-grid">{items.slice(0, 12).map((item) => <button key={item.item_id} className="action-card" onClick={() => setSelected(item)}><span>{item.product?.category?.category_name || "Item"}</span><strong>{item.product?.product_name || "Unnamed product"}</strong><small>{money(item.current_price)}</small></button>)}</div> : <Empty>Create an item before changing a price.</Empty>}</section>}
    {selected && <PriceChangeForm item={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); onSaved(); }} />}
    <section className="panel table-panel"><Head title="Price changes" sub="Permanent audit trail" />{priceChanges.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Previous</th><th>New</th><th>Changed</th><th>By</th><th>Reason</th></tr></thead><tbody>{priceChanges.map((row) => <tr key={row.log_id}><td><strong>{row.item?.product?.product_name || "Unknown item"}</strong>{row.is_correction && <small>Correction entry</small>}</td><td>{money(row.old_price)}</td><td><strong>{money(row.new_price)}</strong></td><td>{formatDate(row.changed_at)}</td><td>{row.staff_account?.full_name || "Unknown staff"}</td><td>{row.reason || "—"}</td></tr>)}</tbody></table></div> : <Empty>No price changes have been recorded.</Empty>}</section>
  </>;
}

function PriceChangeForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(String(item.current_price));
  const [reason, setReason] = useState("");
  const [correction, setCorrection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("change_item_price", {
      p_item_id: item.item_id,
      p_new_price: Number(price),
      p_reason: reason.trim() || null,
      p_is_correction: correction,
    });
    if (rpcError) setError(rpcError.message);
    else onSaved();
    setBusy(false);
  }

  return <section className="panel form-panel">
    <div className="panel-head"><div><h2>Change price</h2><p>{item.product?.product_name} · current {money(item.current_price)}</p></div><button className="secondary" onClick={onClose}>Close</button></div>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label><span>New price</span><input required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label><span>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Supplier cost, promotion, correction…" /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={correction} onChange={(e) => setCorrection(e.target.checked)} /><span>Mark this as a correction; keep the correction visible in history.</span></label>
      {error && <div className="error-banner">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Recording price change…" : "Record price change"}</button>
    </form>
  </section>;
}

function Stock({ items, movements, stockEnabled, onSaved }: { items: Item[]; movements: Movement[]; stockEnabled: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const totalStock = items.reduce((sum, item) => sum + (item.current_stock_qty ?? 0), 0);
  const lowStock = items.filter((item) => item.current_stock_qty != null && item.reorder_level != null && item.current_stock_qty <= item.reorder_level).length;

  return <>
    <div className="hero-row"><div><p className="eyebrow">STOCK CONTROL</p><h1>Stock</h1><p className="muted">Sales, restocks, losses, spoilage and corrections are written as movements with the resulting stock balance.</p></div><button className="primary" onClick={() => setOpen(true)} disabled={!stockEnabled}><Icon name="plus" />Record movement</button></div>
    {!stockEnabled && <div className="warning-banner">Stock tracking is disabled for this SME. An Owner can enable the Stock module from business settings.</div>}
    <div className="metric-grid three"><Metric label="On hand" value={totalStock} detail="Current item quantities" /><Metric label="Low stock" value={lowStock} detail="At or below reorder level" warning={lowStock > 0} /><Metric label="Recorded movements" value={movements.length} detail="Permanent movement history" /></div>
    {open && stockEnabled && <StockMovementForm items={items} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />}
    <section className="panel"><Head title="Movement history" sub="Attributed to the staff account that recorded it" />{movements.length ? <div className="movement-list">{movements.map((m) => <Movement key={m.movement_id} m={m} />)}</div> : <Empty>No stock movements have been recorded.</Empty>}</section>
  </>;
}

function StockMovementForm({ items, onClose, onSaved }: { items: Item[]; onClose: () => void; onSaved: () => void }) {
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("RESTOCK");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("record_stock_movement", {
      p_item_id: Number(itemId),
      p_movement_type: type,
      p_quantity: Number(quantity),
    });
    if (rpcError) setError(rpcError.message);
    else onSaved();
    setBusy(false);
  }

  return <section className="panel form-panel">
    <div className="panel-head"><div><h2>Record stock movement</h2><p>Adjustment quantity can be positive or negative; other movement types use positive quantities.</p></div><button className="secondary" onClick={onClose}>Close</button></div>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label><span>Item</span><select required value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Select item…</option>{items.map((item) => <option key={item.item_id} value={item.item_id}>{item.product?.product_name || "Unnamed item"} · {item.current_stock_qty ?? 0} on hand</option>)}</select></label>
        <label><span>Movement type</span><select value={type} onChange={(e) => setType(e.target.value)}><option>RESTOCK</option><option>SALE</option><option>LOSS</option><option>SPOILAGE</option><option>ADJUSTMENT</option></select></label>
        <label><span>{type === "ADJUSTMENT" ? "Adjustment (+ / -)" : "Quantity"}</span><input required type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Recording movement…" : "Record movement"}</button>
    </form>
  </section>;
}

function Reports({ items, movements, priceChanges }: { items: Item[]; movements: Movement[]; priceChanges: PriceChange[] }) {
  const marginItems = items.filter((item) => item.current_cost != null && item.current_price > 0);
  const avgMargin = marginItems.length ? marginItems.reduce((sum, item) => sum + ((item.current_price - Number(item.current_cost)) / item.current_price) * 100, 0) / marginItems.length : null;
  const salesUnits = movements.filter((row) => row.movement_type === "SALE").reduce((sum, row) => sum + row.quantity, 0);
  const restockUnits = movements.filter((row) => row.movement_type === "RESTOCK").reduce((sum, row) => sum + row.quantity, 0);

  return <>
    <div className="hero-row"><div><p className="eyebrow">INSIGHTS</p><h1>Reports</h1><p className="muted">Management indicators are computed from actual item, movement and price-change records.</p></div></div>
    {!items.length && !movements.length && !priceChanges.length ? <section className="panel"><Empty>No report data is available yet. Create items or record operational activity first.</Empty></section> :
      <div className="report-grid">
        <Report title="Average gross margin" value={avgMargin == null ? "—" : `${avgMargin.toFixed(1)}%`} detail={avgMargin == null ? "Requires recorded item costs" : "Average across items with cost"} />
        <Report title="Recorded sales units" value={salesUnits.toLocaleString()} detail="From SALE stock movements" />
        <Report title="Recorded restock units" value={restockUnits.toLocaleString()} detail="From RESTOCK movements" />
        <Report title="Price changes" value={priceChanges.length.toLocaleString()} detail="Permanent price-change records" />
      </div>}
  </>;
}

function Head({ title, sub, action, onClick }: { title: string; sub: string; action?: string; onClick?: () => void }) {
  return <div className="panel-head"><div><h2>{title}</h2><p>{sub}</p></div>{action && <button className="text-button" onClick={onClick}>{action}<Icon name="arrow" /></button>}</div>;
}

function Metric({ label, value, detail, warning }: { label: string; value: number | string; detail: string; warning?: boolean }) {
  return <div className="metric"><div className="metric-icon"><Icon name={warning ? "bell" : "box"} /></div><span>{label}</span><strong>{value}</strong><small className={warning ? "warn" : ""}>{detail}</small></div>;
}

function Movement({ m }: { m: Movement }) {
  return <div className="movement"><span className="time">{formatDate(m.moved_at)}</span><span className={"movement-type " + m.movement_type.toLowerCase()}>{m.movement_type}</span><div className="movement-name"><strong>{m.item?.product?.product_name || "Unknown item"}</strong><small>Recorded by {m.staff_account?.full_name || "Unknown staff"} · quantity {m.quantity}</small></div><strong>{m.quantity}</strong></div>;
}

function Alert({ item }: { item: Item }) {
  const stock = item.current_stock_qty ?? 0;
  return <div className="alert"><i className="alert-dot" /><div><strong>{item.product?.product_name || "Unnamed product"}</strong><small>{stock === 0 ? "Out of stock" : `${stock} left`}</small></div></div>;
}

function Report({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <section className="panel report-card"><span>{title}</span><strong>{value}</strong><small>{detail}</small></section>;
}
