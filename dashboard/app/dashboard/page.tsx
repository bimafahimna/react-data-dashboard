import TimeframeChart from "@/components/dashboard/TimeframeChart";
import ProductCards from "@/components/dashboard/ProductCards";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track key trends and switch the timeframe for deeper insight.
        </p>
      </div>

      <TimeframeChart />
      <ProductCards />
    </main>
  );
}
