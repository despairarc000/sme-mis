"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PublicPriceRow = {
  product_id: number;
  product_name: string;
  brand: string | null;
  barcode: string | null;
  sme_id: number;
  sme_name: string;
  region: string | null;
  province: string | null;
  city_municipality: string | null;
  barangay: string | null;
  current_price: number;
  price_updated_at: string;
  availability_label: string;
  store_count: number;
  area_median: number | null;
  area_min: number | null;
  area_max: number | null;
  srp_amount: number | null;
  srp_effectivity_date: string | null;
  srp_bulletin_reference: string | null;
  price_position: string | null;
  price_increase_visible: boolean;
  verified_comments: Array<{
    comment: string;
    submitted_at: string;
    store_response: string | null;
    responded_at: string | null;
  }>;
};

function money(value: number | null | undefined) {
  return value == null ? "—" : `₱${Number(value).toFixed(2)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z",
  };
  return <svg viewBox="0 0 24 24" className="icon"><path d={paths[name]} /></svg>;
}

export default function PublicPriceLookup() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [cityMunicipality, setCityMunicipality] = useState("");
  const [rows, setRows] = useState<PublicPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLookupError("");

      const { data, error } = await supabase.rpc("lookup_public_prices", {
        p_query: query.trim() || null,
        p_region: region.trim() || null,
        p_province: province.trim() || null,
        p_city_municipality: cityMunicipality.trim() || null,
        p_barangay: null,
      });

      if (!active) return;
      if (error) {
        setLookupError(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as PublicPriceRow[]);
      }
      setLoading(false);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, region, province, cityMunicipality]);

  const grouped = useMemo(() => {
    const groups = new Map<number, PublicPriceRow[]>();
    for (const row of rows) {
      const bucket = groups.get(row.product_id) ?? [];
      bucket.push(row);
      groups.set(row.product_id, bucket);
    }
    return Array.from(groups.values());
  }, [rows]);

  return (
    <div className="public-page">
      <div className="public-head">
        <div className="public-logo"><div className="brand-mark">S</div><strong>SME MIS</strong><span>Price lookup</span></div>
        <p className="eyebrow">PUBLIC PRICE LOOKUP</p>
        <h1>Compare current listed prices.</h1>
        <p className="muted">Public results exclude cost, margin, stock quantity, staff identity and private reports. Area statistics appear only when at least three stores qualify.</p>
      </div>

      <section className="public-search-wrap">
        <div className="public-search search">
          <Icon name="search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, brand, alias, or barcode" />
        </div>
        <div className="lookup-filters">
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region" />
          <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province" />
          <input value={cityMunicipality} onChange={(e) => setCityMunicipality(e.target.value)} placeholder="City / Municipality" />
        </div>
      </section>

      {lookupError && <div className="error-banner public-error">Unable to load public prices: {lookupError}</div>}

      {loading ? (
        <div className="loading-state">Searching live public price records…</div>
      ) : grouped.length ? (
        <div className="lookup-groups">
          {grouped.map((group) => {
            const first = group[0];
            return (
              <section className="lookup-group" key={first.product_id}>
                <div className="lookup-group-head">
                  <div>
                    <span>{first.brand || "No brand"}</span>
                    <h2>{first.product_name}</h2>
                    {first.barcode && <small>Barcode {first.barcode}</small>}
                  </div>
                  <div className="lookup-stat"><strong>{group.length}</strong><span>store{group.length === 1 ? "" : "s"}</span></div>
                </div>

                <div className="lookup-stores">
                  {group.map((row) => (
                    <article className="lookup-card" key={row.sme_id + ":" + row.product_id}>
                      <div className="product-thumb">{(row.sme_name || "?")[0]}</div>
                      <div className="lookup-info">
                        <span>{[row.city_municipality, row.province].filter(Boolean).join(", ") || row.region || "Location not provided"}</span>
                        <h3>{row.sme_name}</h3>
                        <strong>{money(row.current_price)}</strong>
                        <small>Updated {formatDate(row.price_updated_at)} · {row.availability_label}</small>
                        {row.price_position && <em className="price-position">{row.price_position}</em>}
                        {row.price_increase_visible && <em className="price-increase">Visible price increase</em>}
                        {row.srp_amount != null && <p className="public-meta">DTI SRP: {money(row.srp_amount)}{row.srp_effectivity_date ? " · effective " + row.srp_effectivity_date : ""}{row.srp_bulletin_reference ? " · " + row.srp_bulletin_reference : ""}</p>}
                        {row.area_median != null && <p className="public-meta">Area median {money(row.area_median)} · range {money(row.area_min)}–{money(row.area_max)}</p>}
                        {row.verified_comments.length > 0 && (
                          <div className="public-comments">
                            {row.verified_comments.slice(0, 2).map((feedback, index) => (
                              <div key={index}>
                                <p>“{feedback.comment}”</p>
                                {feedback.store_response && <small>Store response: {feedback.store_response}</small>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No participating-store prices match this lookup.</div>
      )}
    </div>
  );
}
