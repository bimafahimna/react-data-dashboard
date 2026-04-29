import React from "react";
import ProductCards from "@/components/dashboard/ProductCards";
import type { Product } from "@/components/dashboard/ProductCard";
import TimeframeChart from "@/components/dashboard/TimeframeChart";
import { getProductsByStoreId } from "@/lib/repositories/products";

const StoreDetailsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const hasChartData = false;

  const { id } = await params
  const rawProducts = await getProductsByStoreId(Number(id));

  const products: Product[] = rawProducts.map((p) => {
    return {
      name: p.name,
      currency: "USD",
      category: p.category,
      growth: p.growth,
      orders: p.orders,
      revenue: p.revenue
    }
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      {hasChartData ? (
        <TimeframeChart />
      ) : (
        <section className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">No chart data yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Add your store metrics in here.
          </p>
        </section>
      )}

      {products.length > 0 ? (
        <ProductCards products={products} />
      ) : (
        <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-slate-800">No products yet</h2>
          <p className="mt-2 text-sm text-slate-500">Product data for this store is empty.</p>
        </section>
      )}
    </main>
  );
};

export default StoreDetailsPage;
