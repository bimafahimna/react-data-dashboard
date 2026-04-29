type Product = {
  name: string;
  category: string;
  revenue: string;
  orders: number;
  growth: string;
}

const PRODUCTS: Product[] = [
  {
    name: "Aurora Running Shoes",
    category: "Footwear",
    revenue: "$24,500",
    orders: 312,
    growth: "+12.4%",
  },
  {
    name: "Nimbus Smart Bottle",
    category: "Accessories",
    revenue: "$18,200",
    orders: 228,
    growth: "+8.1%",
  },
  {
    name: "Vertex Yoga Mat Pro",
    category: "Fitness",
    revenue: "$15,900",
    orders: 196,
    growth: "+5.7%",
  },
];

export default function ProductCards() {
  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Top Products</h2>
        <p className="text-sm text-slate-500">This month performance snapshot</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PRODUCTS.map((product) => (
          <article
            key={product.name}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.category}</p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{product.name}</h3>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Revenue</p>
                <p className="text-sm font-semibold text-slate-800">{product.revenue}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Orders</p>
                <p className="text-sm font-semibold text-slate-800">{product.orders}</p>
              </div>
            </div>

            <p className="mt-4 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              Growth {product.growth}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
