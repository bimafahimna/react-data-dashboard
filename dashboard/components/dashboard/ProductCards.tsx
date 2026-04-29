import ProductCard, { type Product } from "./ProductCard";

const PRODUCTS: Product[] = [
  {
    name: "Aurora Running Shoes",
    category: "Footwear",
    currency: "USD",
    revenue: 24500,
    orders: 312,
    growth: 12.4,
  },
  {
    name: "Nimbus Smart Bottle",
    category: "Accessories",
    currency: "USD",
    revenue: 18200,
    orders: 228,
    growth: 8.1,
  },
  {
    name: "Vertex Yoga Mat Pro",
    category: "Fitness",
    currency: "USD",
    revenue: 15900,
    orders: 196,
    growth: 5.7,
  },
];

type ProductCardsProps = {
  products?: Product[];
};

export default function ProductCards({ products = PRODUCTS }: ProductCardsProps) {
  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Top Products</h2>
        <p className="text-sm text-slate-500">This month performance snapshot</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.name} product={product} />
        ))}
      </div>
    </section>
  );
}
