import { getProductsByStoreId } from "@/lib/repositories/products";
import { getStores } from "@/lib/repositories/stores";

type DataRow = {
  storeName: string;
  location: string;
  products: number;
  totalRevenue: number;
  totalOrders: number;
  avgGrowth: number;
};

export default async function DataPage() {
  const stores = await getStores();

  const rows: DataRow[] = await Promise.all(
    stores.map(async (store) => {
      const products = await getProductsByStoreId(store.id);
      const totalRevenue = products.reduce((sum, product) => sum + product.revenue, 0);
      const totalOrders = products.reduce((sum, product) => sum + product.orders, 0);
      const avgGrowth =
        products.length > 0
          ? products.reduce((sum, product) => sum + product.growth, 0) / products.length
          : 0;

      return {
        storeName: store.name,
        location: store.location,
        products: products.length,
        totalRevenue,
        totalOrders,
        avgGrowth,
      };
    })
  );

  const grandRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const grandOrders = rows.reduce((sum, row) => sum + row.totalOrders, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Data</h1>
        <p className="mt-1 text-sm text-slate-500">MVP analytics snapshot across all stores.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Stores</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Products</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {rows.reduce((sum, row) => sum + row.products, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Revenue</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
              grandRevenue
            )}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Orders</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{grandOrders}</p>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Avg Growth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {rows.map((row) => (
                <tr key={row.storeName}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.storeName}</td>
                  <td className="px-4 py-3">{row.location}</td>
                  <td className="px-4 py-3">{row.products}</td>
                  <td className="px-4 py-3">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(row.totalRevenue)}
                  </td>
                  <td className="px-4 py-3">{row.totalOrders}</td>
                  <td className="px-4 py-3">{row.avgGrowth.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
