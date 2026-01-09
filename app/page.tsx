"use client";

import { useEffect, useMemo, useState } from "react";

type Inputs = {
  propertyName: string;
  state: string;
  county: string;
  assessedValue: string;
  millageRate: string;
  exemptions: string;
  appealReductionPercent: string;
};

const STORAGE_KEY = "creTax.inputs.v1";

function toNumber(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function Page() {
  const [inputs, setInputs] = useState<Inputs>({
    propertyName: "CRE Tax Calculator",
    state: "FL",
    county: "Broward",
    assessedValue: "10000000",
    millageRate: "20.0000",
    exemptions: "0",
    appealReductionPercent: "10",
  });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    setInputs((prev) => ({ ...prev, ...JSON.parse(raw) }));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const calc = useMemo(() => {
    const assessedValue = toNumber(inputs.assessedValue);
    const millageRate = toNumber(inputs.millageRate);
    const exemptions = toNumber(inputs.exemptions);
    const appealReductionPercent = toNumber(inputs.appealReductionPercent);

    const taxableValue = Math.max(assessedValue - exemptions, 0);
    const taxBill = taxableValue * (millageRate / 1000);
    const appealedTaxBill = taxBill * (1 - appealReductionPercent / 100);
    const savings = taxBill - appealedTaxBill;
    const monthlyEscrow = appealedTaxBill / 12;

    return {
      taxableValue,
      taxBill,
      appealedTaxBill,
      savings,
      monthlyEscrow,
    };
  }, [inputs]);

  function update<K extends keyof Inputs>(key: K, value: Inputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl grid gap-6 md:grid-cols-2">
        <section className="bg-white rounded-xl p-6 shadow">
          <h1 className="text-2xl font-semibold mb-4">
            {inputs.propertyName}
          </h1>

          <div className="grid gap-3">
            <input className="input" placeholder="State" value={inputs.state}
              onChange={(e) => update("state", e.target.value)} />

            <input className="input" placeholder="County" value={inputs.county}
              onChange={(e) => update("county", e.target.value)} />

            <input className="input" placeholder="Assessed Value"
              value={inputs.assessedValue}
              onChange={(e) => update("assessedValue", e.target.value)} />

            <input className="input" placeholder="Millage Rate (mills)"
              value={inputs.millageRate}
              onChange={(e) => update("millageRate", e.target.value)} />

            <input className="input" placeholder="Exemptions"
              value={inputs.exemptions}
              onChange={(e) => update("exemptions", e.target.value)} />

            <input className="input" placeholder="Appeal Reduction (%)"
              value={inputs.appealReductionPercent}
              onChange={(e) => update("appealReductionPercent", e.target.value)} />
          </div>
        </section>

        <section className="bg-white rounded-xl p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <ul className="space-y-2 text-lg">
            <li>Taxable Value: <b>{formatCurrency(calc.taxableValue)}</b></li>
            <li>Tax Bill: <b>{formatCurrency(calc.taxBill)}</b></li>
            <li>Post-Appeal Tax: <b>{formatCurrency(calc.appealedTaxBill)}</b></li>
            <li>Savings: <b>{formatCurrency(calc.savings)}</b></li>
            <li>Monthly Escrow: <b>{formatCurrency(calc.monthlyEscrow)}</b></li>
          </ul>
        </section>
      </div>
    </main>
  );
}
