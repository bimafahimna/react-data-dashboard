export type Product = {
  name: string;
  category: string;
  currency: string;
  revenue: number;
  orders: number;
  growth: number;
  storeSource?: string;
  storeLocation?: string;
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const formattedRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(product.revenue);
  const formattedGrowth = `${product.growth.toFixed(2)}%`;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {product.category}
      </p>
      <h3 className="mt-1 text-base font-semibold text-slate-900">{product.name}</h3>
      {product.storeSource ? (
        <p className="mt-1 text-xs text-slate-500">Source: {product.storeSource}</p>
      ) : null}
      {product.storeLocation ? (
        <p className="text-xs text-slate-500">Location: {product.storeLocation}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Revenue</p>
          <p className="text-sm font-semibold text-slate-800">{formattedRevenue}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Orders</p>
          <p className="text-sm font-semibold text-slate-800">{product.orders}</p>
        </div>
      </div>

      <p className="mt-4 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
        Growth {formattedGrowth}
      </p>
    </article>
  );
}
