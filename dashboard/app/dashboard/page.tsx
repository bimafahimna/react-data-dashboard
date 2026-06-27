import TimeframeChart from "@/components/dashboard/TimeframeChart";
import ProductCards from "@/components/dashboard/ProductCards";
import type { Product } from "@/components/dashboard/ProductCard";
import { getProductsByStoreId } from "@/lib/repository/products";
import { getStores } from "@/lib/repository/stores";

type StoreProductGroup = {
  storeId: number;
  storeName: string;
  products: Product[];
  chartSeed: number;
};

function generateStoreSeries(seed: number) {
  const now = new Date(Date.UTC(2026, 3, 29));
  const days = 120;

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - 1 - index));

    const day = date.getDate();
    const seasonal = Math.sin((day / 31) * Math.PI + seed * 0.4) * (16 + (seed % 3) * 5);
    const trend = (index + 1) * (0.2 + ((seed % 5) + 1) * 0.08);
    const noise = ((day * (seed + 9)) % 11) - 5;

    return {
      date,
      value: Math.max(20, Math.round(58 + seasonal + trend + noise)),
    };
  });
}

export default async function Home() {
  const stores = await getStores();

  const storeGroups: StoreProductGroup[] = await Promise.all(
    stores.map(async (store) => {
      const rawProducts = await getProductsByStoreId(store.id);

      const products: Product[] = rawProducts.map((product) => ({
        name: product.name,
        category: product.category,
        currency: "USD",
        revenue: product.revenue,
        orders: product.orders,
        growth: product.growth,
        storeSource: store.name,
        storeLocation: store.location,
      }));

      const totalRevenue = rawProducts.reduce((sum, product) => sum + product.revenue, 0);
      const totalOrders = rawProducts.reduce((sum, product) => sum + product.orders, 0);
      const growthSeed = rawProducts.length > 0
        ? Math.round(rawProducts.reduce((sum, product) => sum + product.growth, 0))
        : 0;

      return {
        storeId: store.id,
        storeName: store.name,
        products,
        chartSeed: store.id + totalRevenue / 1000 + totalOrders / 100 + growthSeed,
      };
    })
  );

  const chartStoresData = storeGroups.map((group) => ({
    storeId: group.storeId,
    storeName: group.storeName,
    records: generateStoreSeries(Math.round(group.chartSeed)),
  }));
  const topProducts = storeGroups
    .flatMap((group) => group.products)
    .sort((a, b) => b.growth - a.growth);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track each store in one view and review top products by source.
        </p>
      </div>

      <TimeframeChart storesData={chartStoresData} />

      {topProducts.length > 0 ? (
        <ProductCards
          products={topProducts}
          title="Top Products Across All Stores"
          subtitle="Ordered by highest growth"
        />
      ) : (
        <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-800">No products yet</h2>
          <p className="mt-2 text-sm text-slate-500">Add product data to compare performance across stores.</p>
        </section>
      )}
    </main>
  );
}
