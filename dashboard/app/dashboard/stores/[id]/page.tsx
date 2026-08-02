import { requireAccountId } from "@/lib/session-helpers";
import { getProductsByStoreId } from "@/lib/repository/products";

const StoreDetailsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const ownerId = await requireAccountId();
  const { id } = await params;
  const products = await getProductsByStoreId(Number(id), ownerId);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <section className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">No chart data yet</h2>
        <p className="mt-2 text-sm text-slate-500">Add your store metrics in here.</p>
      </section>

      {products.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3">{product.categoryName}</td>
                    <td className="px-4 py-3">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(product.unitPriceCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
