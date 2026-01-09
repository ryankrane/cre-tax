"use client";

import React, { useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type CountyOption = {
  label: string;
  mills: number | "custom";
  dataCounty?: string;
};

const COUNTIES: CountyOption[] = [
  { label: "Select a county...", mills: "custom" }, // placeholder handled separately
  { label: "Miami-Dade County, FL — 19.83 mills", mills: 19.8324, dataCounty: "miami-dade" },
  { label: "Broward County, FL — 18.54 mills", mills: 18.5431, dataCounty: "broward" },
  { label: "Palm Beach County, FL — 20.21 mills", mills: 20.2109, dataCounty: "palm beach" },
  { label: "Hillsborough County, FL — 18.90 mills", mills: 18.9012, dataCounty: "hillsborough" },
  { label: "Orange County, FL — 17.65 mills", mills: 17.6543, dataCounty: "orange" },
  { label: "Duval County, FL — 19.12 mills", mills: 19.1234, dataCounty: "duval" },
  { label: "Pinellas County, FL — 18.23 mills", mills: 18.2345, dataCounty: "pinellas" },
  { label: "Lee County, FL — 17.89 mills", mills: 17.8901, dataCounty: "lee" },
  { label: "Polk County, FL — 18.12 mills", mills: 18.1234, dataCounty: "polk" },
  { label: "Brevard County, FL — 17.57 mills", mills: 17.5678, dataCounty: "brevard" },
  { label: "Volusia County, FL — 19.23 mills", mills: 19.2345, dataCounty: "volusia" },
  { label: "Seminole County, FL — 18.79 mills", mills: 18.789, dataCounty: "seminole" },
];

const STORAGE_KEY = "rktaxcalc.v1";

function formatCurrency(num: number): string {
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function safeNumber(v: string): number {
  const cleaned = v.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function Page() {
  // Inputs
  const [theme, setTheme] = useState<Theme>("light");
  const [address, setAddress] = useState("");
  const [countyValue, setCountyValue] = useState<string>(""); // mills number string
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [assessmentPct, setAssessmentPct] = useState<number>(75);

  // UI state
  const [lookupLoading, setLookupLoading] = useState(false);
  const [countyResult, setCountyResult] = useState<{ show: boolean; message: string; isError: boolean }>({
    show: false,
    message: "",
    isError: false,
  });
  const [resultsVisible, setResultsVisible] = useState(false);
  const [autoLookupTimeout, setAutoLookupTimeout] = useState<NodeJS.Timeout | null>(null);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<{
        theme: Theme;
        address: string;
        countyValue: string;
        purchasePrice: string;
        assessmentPct: number;
      }>;
      if (data.theme === "light" || data.theme === "dark") setTheme(data.theme);
      if (typeof data.address === "string") setAddress(data.address);
      if (typeof data.countyValue === "string") setCountyValue(data.countyValue);
      if (typeof data.purchasePrice === "string") setPurchasePrice(data.purchasePrice);
      if (typeof data.assessmentPct === "number") setAssessmentPct(data.assessmentPct);
    } catch {
      // ignore
    }
  }, []);

  // Persist state
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme, address, countyValue, purchasePrice, assessmentPct })
      );
    } catch {
      // ignore
    }
  }, [theme, address, countyValue, purchasePrice, assessmentPct]);

  // Apply theme to <html data-theme="...">
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const millageRate = useMemo(() => {
    return safeNumber(countyValue);
  }, [countyValue]);

  const calc = useMemo(() => {
    const pp = safeNumber(purchasePrice);
    const ratio = assessmentPct / 100;
    const assessed = pp > 0 ? pp * ratio : 0;
    const annual = pp > 0 && millageRate > 0 ? assessed * (millageRate / 1000) : 0;
    const monthly = annual / 12;

    return {
      purchasePrice: pp,
      ratio,
      assessedValue: assessed,
      millageRate,
      annualTax: annual,
      monthlyTax: monthly,
    };
  }, [purchasePrice, assessmentPct, millageRate]);

  function showCountyResult(message: string, isError: boolean) {
    setCountyResult({ show: true, message, isError });
  }

  function selectCountyByName(countyName: string): boolean {
    const normalized = countyName.toLowerCase().replace(" county", "").trim();
    const match = COUNTIES.find((c) => c.dataCounty && c.dataCounty.includes(normalized));
    if (match && match.mills !== "custom") {
      setCountyValue(String(match.mills));
      return true;
    }
    return false;
  }

  async function lookupCounty(isAutoLookup = false) {
    const addr = address.trim();
    if (!addr) {
      if (!isAutoLookup) {
        showCountyResult("Please enter an address first", true);
      }
      return;
    }

    setLookupLoading(true);
    setCountyResult((p) => ({ ...p, show: false }));

    try {
      // Extract zip code from address
      const zipMatch = addr.match(/\b(\d{5})\b/);
      if (!zipMatch) {
        if (!isAutoLookup) {
          showCountyResult("Please include a 5-digit ZIP code in the address", true);
        }
        setLookupLoading(false);
        return;
      }

      const zipCode = zipMatch[1];

      // Use ZipCodeAPI to get county
      const res = await fetch(`https://api.zippopotam.us/us/${zipCode}`);

      if (!res.ok) {
        if (!isAutoLookup) {
          showCountyResult("ZIP code not found — please check and try again", true);
        }
        setLookupLoading(false);
        return;
      }

      const data = await res.json();

      // Check if it's a Florida ZIP
      if (data?.places?.[0]?.["state abbreviation"] !== "FL") {
        if (!isAutoLookup) {
          showCountyResult("Please enter a Florida address", true);
        }
        setLookupLoading(false);
        return;
      }

      // Use FCC API to get county from coordinates
      const fccRes = await fetch(`https://geo.fcc.gov/api/census/area?lat=${data.places[0].latitude}&lon=${data.places[0].longitude}&format=json`);

      if (!fccRes.ok) {
        if (!isAutoLookup) {
          showCountyResult("Could not determine county", true);
        }
        setLookupLoading(false);
        return;
      }

      const fccData = await fccRes.json();
      const countyName = fccData?.results?.[0]?.county_name;

      if (!countyName) {
        if (!isAutoLookup) {
          showCountyResult("Could not determine county from ZIP code", true);
        }
        setLookupLoading(false);
        return;
      }

      // Try to match county
      const matched = selectCountyByName(countyName);
      if (matched) {
        showCountyResult(`Found ${countyName} County — auto-selected`, false);
      } else {
        showCountyResult(`${countyName} County not in our database`, true);
      }
    } catch {
      if (!isAutoLookup) {
        showCountyResult("Lookup failed — check your connection", true);
      }
    } finally {
      setLookupLoading(false);
    }
  }

  // Auto-lookup when ZIP code is detected in address
  useEffect(() => {
    // Clear any existing timeout
    if (autoLookupTimeout) {
      clearTimeout(autoLookupTimeout);
    }

    // Check if address contains a 5-digit ZIP code
    const zipMatch = address.match(/\b(\d{5})\b/);
    if (zipMatch) {
      // Debounce the lookup by 800ms
      const timeout = setTimeout(() => {
        lookupCounty(true);
      }, 800);
      setAutoLookupTimeout(timeout);
    }

    return () => {
      if (autoLookupTimeout) {
        clearTimeout(autoLookupTimeout);
      }
    };
  }, [address]);

  function calculateTax() {
    if (!calc.purchasePrice || calc.purchasePrice <= 0) {
      alert("Please enter a valid purchase price");
      return;
    }

    if (!millageRate || millageRate <= 0) {
      alert("Please select a county or enter a millage rate");
      return;
    }

    setResultsVisible(true);

    // Scroll to results (match your original behavior)
    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const sliderLabel = `${assessmentPct}%`;

  return (
    <>
      <div className="container">
        <header>
          <div className="brand">
            <div className="logo">
              RK Tax Calc<span>.</span>
            </div>
            <div className="tagline">Property Tax Calculator</div>
          </div>

          <div className="theme-toggle">
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
              aria-label="Light mode"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>

            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
              aria-label="Dark mode"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            </button>
          </div>
        </header>

        {/* Info Section */}
        <div className="info-section">
          <h3>Why Calculate Property Taxes?</h3>
          <p>
            When a property is sold or purchased, property taxes are <strong>reassessed</strong> based on the new purchase price.
            In Florida, taxes are calculated using a <strong>millage rate</strong> (mills per $1,000 of assessed value) that varies by county.
          </p>
          <p>
            This tool automatically detects your property's county from the ZIP code and calculates the new annual and
            monthly tax obligations you'll face after the purchase closes.
          </p>
        </div>

        {/* Property Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Property Details</h2>
            <p className="card-subtitle">Enter a ZIP code to auto-detect the county</p>
          </div>

          <div className="form-group">
            <label htmlFor="address">Property Address</label>
            <div className="address-group">
              <input
                type="text"
                id="address"
                placeholder="123 Main St, Miami, FL 33101"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupCounty(false);
                  }
                }}
              />
              <button
                className={`btn-lookup ${lookupLoading ? "loading" : ""}`}
                id="lookupBtn"
                onClick={() => lookupCounty(false)}
                disabled={lookupLoading}
                type="button"
              >
                Find County
              </button>
            </div>

            <div className={`county-result ${countyResult.show ? "show" : ""} ${countyResult.isError ? "error" : ""}`} id="countyResult">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{countyResult.message}</span>
            </div>
          </div>
        </div>

        {/* Calculation Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Purchase & Assessment</h2>
            <p className="card-subtitle">Calculate your property tax liability</p>
          </div>

          <div className="form-group">
            <label htmlFor="purchasePrice">Purchase Price</label>
            <input
              type="number"
              id="purchasePrice"
              placeholder="1,500,000"
              min={0}
              step={1000}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Assessment Ratio</label>
            <div className="slider-wrapper">
              <div className="slider-header">
                <span className="slider-label">Percentage of purchase price assessed</span>
                <span className="slider-value" id="sliderValue">
                  {sliderLabel}
                </span>
              </div>

              <input
                type="range"
                id="assessmentSlider"
                min={70}
                max={85}
                value={assessmentPct}
                step={1}
                onChange={(e) => setAssessmentPct(Number(e.target.value))}
              />

              <div className="slider-range">
                <span>70%</span>
                <span>85%</span>
              </div>
            </div>
          </div>

          <button className="btn-primary" onClick={calculateTax} type="button">
            Calculate Tax
          </button>
        </div>

        {/* Results Card */}
        <div className={`card results ${resultsVisible ? "show" : ""}`} id="results">
          <div className="card-header">
            <h2 className="card-title">Your Results</h2>
            <p className="card-subtitle">Estimated property tax breakdown</p>
          </div>

          <div className="result-grid">
            <div className="result-item">
              <div className="result-label">Purchase Price</div>
              <div className="result-value">{calc.purchasePrice ? formatCurrency(calc.purchasePrice) : "—"}</div>
            </div>

            <div className="result-item">
              <div className="result-label">Assessment Ratio</div>
              <div className="result-value">{calc.purchasePrice ? `${Math.round(calc.ratio * 100)}%` : "—"}</div>
            </div>

            <div className="result-item">
              <div className="result-label">Assessed Value</div>
              <div className="result-value">{calc.purchasePrice ? formatCurrency(calc.assessedValue) : "—"}</div>
            </div>

            <div className="result-item">
              <div className="result-label">Millage Rate</div>
              <div className="result-value">{millageRate ? `${millageRate.toFixed(2)} mills` : "—"}</div>
            </div>
          </div>

          <div className="tax-summary">
            <div className="tax-summary-label">Estimated Property Tax</div>

            <div className="tax-summary-grid">
              <div className="tax-amount">
                <div className="tax-amount-value">{calc.annualTax ? formatCurrency(calc.annualTax) : "—"}</div>
                <div className="tax-amount-period">per year</div>
              </div>

              <div className="tax-amount">
                <div className="tax-amount-value">{calc.monthlyTax ? formatCurrency(calc.monthlyTax) : "—"}</div>
                <div className="tax-amount-period">per month</div>
              </div>
            </div>
          </div>
        </div>

        <footer>
          <p>
            Built by <a href="#">Ryan Krane</a> · RK Tax Calc © 2025 · v1.0
          </p>
        </footer>
      </div>

      {/* Global CSS copied from your HTML (kept 1:1) */}
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        :root {
          --font: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
          --carolina: #4b9cd3;
          --carolina-light: #7bafd4;
          --carolina-pale: #e8f4fc;
          --carolina-dark: #3a7ca5;

          --bg-primary: #ffffff;
          --bg-secondary: #f5f5f7;
          --bg-card: #ffffff;
          --text-primary: #1d1d1f;
          --text-secondary: #6e6e73;
          --border: #d2d2d7;
          --border-light: #e8e8ed;
          --shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
          --shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.1);
          --input-bg: #f5f5f7;
          --toggle-bg: #e8e8ed;
        }

        [data-theme="dark"] {
          --bg-primary: #000000;
          --bg-secondary: #1c1c1e;
          --bg-card: #1c1c1e;
          --text-primary: #f5f5f7;
          --text-secondary: #a1a1a6;
          --border: #38383a;
          --border-light: #2c2c2e;
          --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
          --shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.4);
          --input-bg: #2c2c2e;
          --toggle-bg: #38383a;
          --carolina-pale: rgba(75, 156, 211, 0.15);
        }

        body {
          font-family: var(--font);
          background: var(--bg-secondary);
          color: var(--text-primary);
          min-height: 100vh;
          line-height: 1.5;
          transition: background 0.3s ease, color 0.3s ease;
        }

        .container {
          max-width: 720px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 48px;
        }

        .brand {
          display: flex;
          flex-direction: column;
        }

        .logo {
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }

        .logo span {
          color: var(--carolina);
        }

        .tagline {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--toggle-bg);
          padding: 6px;
          border-radius: 20px;
          transition: background 0.3s ease;
        }

        .theme-toggle button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 14px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .theme-toggle button.active {
          background: var(--bg-card);
          color: var(--carolina);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .theme-toggle button svg {
          width: 18px;
          height: 18px;
        }

        .info-section {
          background: var(--carolina-pale);
          border-radius: 16px;
          padding: 28px 32px;
          margin-bottom: 20px;
          border: 1px solid var(--border-light);
        }

        .info-section h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 16px;
        }

        .info-section p {
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--text-primary);
          margin-bottom: 14px;
        }

        .info-section p:last-child {
          margin-bottom: 0;
        }

        .info-section ul {
          margin: 16px 0;
          padding-left: 24px;
        }

        .info-section li {
          font-size: 0.95rem;
          line-height: 1.7;
          color: var(--text-primary);
          margin-bottom: 10px;
        }

        .info-section li:last-child {
          margin-bottom: 0;
        }

        .info-section strong {
          color: var(--carolina-dark);
          font-weight: 600;
        }

        .card {
          background: var(--bg-card);
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 20px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border-light);
          transition: all 0.3s ease;
        }

        .card:hover {
          box-shadow: var(--shadow-hover);
        }

        .card-header {
          margin-bottom: 28px;
        }

        .card-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .card-subtitle {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group:last-child {
          margin-bottom: 0;
        }

        label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        input[type="text"],
        input[type="number"],
        select {
          width: 100%;
          padding: 14px 18px;
          background: var(--input-bg);
          border: 2px solid transparent;
          border-radius: 14px;
          color: var(--text-primary);
          font-family: var(--font);
          font-size: 1rem;
          transition: all 0.2s ease;
        }

        input[type="text"]:focus,
        input[type="number"]:focus,
        select:focus {
          outline: none;
          border-color: var(--carolina);
          background: var(--bg-card);
        }

        input::placeholder {
          color: var(--text-secondary);
        }

        select {
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236e6e73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 44px;
        }

        .address-group {
          display: flex;
          gap: 10px;
        }

        .address-group input {
          flex: 1;
        }

        .btn-lookup {
          padding: 14px 20px;
          background: var(--carolina-pale);
          border: none;
          border-radius: 14px;
          color: var(--carolina-dark);
          font-family: var(--font);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .btn-lookup:hover {
          background: var(--carolina);
          color: white;
        }

        .btn-lookup:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-lookup.loading {
          position: relative;
          color: transparent;
        }

        .btn-lookup.loading::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          width: 16px;
          height: 16px;
          margin: -8px 0 0 -8px;
          border: 2px solid var(--carolina);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .county-result {
          display: none;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          padding: 12px 16px;
          background: var(--carolina-pale);
          border-radius: 12px;
          font-size: 0.9rem;
          color: var(--carolina-dark);
        }

        .county-result.show {
          display: flex;
          animation: fadeIn 0.3s ease;
        }

        .county-result.error {
          background: #fee2e2;
          color: #dc2626;
        }

        [data-theme="dark"] .county-result.error {
          background: rgba(220, 38, 38, 0.15);
        }

        .county-result svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .slider-wrapper {
          background: var(--input-bg);
          border-radius: 14px;
          padding: 20px;
        }

        .slider-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .slider-label {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .slider-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--carolina);
        }

        input[type="range"] {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: var(--border);
          appearance: none;
          cursor: pointer;
        }

        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--carolina);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(75, 156, 211, 0.4);
          transition: transform 0.2s ease;
        }

        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        input[type="range"]::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--carolina);
          cursor: pointer;
          border: none;
        }

        .slider-range {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .custom-millage {
          display: none;
          margin-top: 16px;
        }

        .custom-millage.show {
          display: block;
          animation: fadeIn 0.3s ease;
        }

        .btn-primary {
          width: 100%;
          padding: 16px 32px;
          background: var(--carolina);
          border: none;
          border-radius: 14px;
          color: white;
          font-family: var(--font);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          background: var(--carolina-dark);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(75, 156, 211, 0.4);
        }

        .btn-primary:active {
          transform: translateY(0);
        }

        .results {
          display: none;
        }

        .results.show {
          display: block;
          animation: slideUp 0.4s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .result-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }

        .result-item {
          background: var(--input-bg);
          padding: 16px 20px;
          border-radius: 14px;
        }

        .result-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 4px;
        }

        .result-value {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .tax-summary {
          background: linear-gradient(135deg, var(--carolina) 0%, var(--carolina-dark) 100%);
          border-radius: 16px;
          padding: 28px;
          color: white;
          text-align: center;
        }

        .tax-summary-label {
          font-size: 0.85rem;
          opacity: 0.9;
          margin-bottom: 8px;
        }

        .tax-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 8px;
        }

        .tax-amount {
          display: flex;
          flex-direction: column;
        }

        .tax-amount-value {
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .tax-amount-period {
          font-size: 0.8rem;
          opacity: 0.85;
          margin-top: 2px;
        }

        footer {
          text-align: center;
          padding: 32px 0 0;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        footer a {
          color: var(--carolina);
          text-decoration: none;
          font-weight: 500;
        }

        footer a:hover {
          text-decoration: underline;
        }

        @media (max-width: 600px) {
          .container {
            padding: 32px 16px 60px;
          }

          header {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
          }

          .card {
            padding: 24px 20px;
            border-radius: 16px;
          }

          .address-group {
            flex-direction: column;
          }

          .result-grid {
            grid-template-columns: 1fr;
          }

          .tax-summary-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .tax-amount-value {
            font-size: 1.75rem;
          }
        }
      `}</style>

      {/* Load Inter font (same as your HTML) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </>
  );
}
