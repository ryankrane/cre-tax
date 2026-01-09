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

function formatPriceInput(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  // Format with commas
  const num = parseInt(digits, 10);
  return "$" + num.toLocaleString("en-US");
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

      let countyName = null;

      // Try FCC API first with timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        const fccRes = await fetch(
          `https://geo.fcc.gov/api/census/area?lat=${data.places[0].latitude}&lon=${data.places[0].longitude}&format=json`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (fccRes.ok) {
          const fccData = await fccRes.json();
          countyName = fccData?.results?.[0]?.county_name;
        }
      } catch (fccError) {
        // FCC API failed, will fall back to direct mapping
        console.log("FCC API failed, using fallback");
      }

      // Fallback: Use direct ZIP to county mapping for common FL counties
      if (!countyName) {
        const cityName = data?.places?.[0]?.["place name"]?.toLowerCase() || "";

        // Direct mapping based on city names
        const cityToCounty: Record<string, string> = {
          "miami": "Miami-Dade",
          "hialeah": "Miami-Dade",
          "coral gables": "Miami-Dade",
          "doral": "Miami-Dade",
          "homestead": "Miami-Dade",
          "fort lauderdale": "Broward",
          "hollywood": "Broward",
          "pembroke pines": "Broward",
          "coral springs": "Broward",
          "miramar": "Broward",
          "west palm beach": "Palm Beach",
          "boca raton": "Palm Beach",
          "boynton beach": "Palm Beach",
          "delray beach": "Palm Beach",
          "wellington": "Palm Beach",
          "tampa": "Hillsborough",
          "orlando": "Orange",
          "jacksonville": "Duval",
          "st petersburg": "Pinellas",
          "clearwater": "Pinellas",
          "fort myers": "Lee",
          "cape coral": "Lee",
          "lakeland": "Polk",
          "melbourne": "Brevard",
          "daytona beach": "Volusia",
          "sanford": "Seminole"
        };

        for (const [city, county] of Object.entries(cityToCounty)) {
          if (cityName.includes(city)) {
            countyName = county;
            break;
          }
        }
      }

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
    } catch (error) {
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
            I built this tool to help me underwrite commercial real estate acquisitions. When a property is sold or purchased,
            property taxes are <strong>reassessed</strong> based on the new purchase price. In Florida, taxes are calculated
            using a <strong>millage rate</strong> (mills per $1,000 of assessed value) that varies by county.
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
              type="text"
              id="purchasePrice"
              placeholder="$1,500,000"
              value={purchasePrice ? formatPriceInput(purchasePrice) : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setPurchasePrice(digits);
              }}
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
          --carolina: #0066cc;
          --carolina-light: #4d94ff;
          --carolina-pale: #e6f0ff;
          --carolina-dark: #004d99;
          --accent: #00b894;

          --bg-primary: #fafbfc;
          --bg-secondary: #f4f6f8;
          --bg-card: #ffffff;
          --text-primary: #0a1f44;
          --text-secondary: #5e6c84;
          --border: #dfe1e6;
          --border-light: #ebecf0;
          --shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06);
          --shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.1);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
          --input-bg: #f7f8fa;
          --toggle-bg: #e8e8ed;
        }

        [data-theme="dark"] {
          --bg-primary: #0d1117;
          --bg-secondary: #161b22;
          --bg-card: #1c2128;
          --text-primary: #e6edf3;
          --text-secondary: #8b949e;
          --border: #30363d;
          --border-light: #21262d;
          --shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.4);
          --shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.4), 0 8px 32px rgba(0, 0, 0, 0.5);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
          --input-bg: #21262d;
          --toggle-bg: #30363d;
          --carolina-pale: rgba(0, 102, 204, 0.15);
          --carolina: #4d94ff;
          --carolina-dark: #0066cc;
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
          max-width: 840px;
          margin: 0 auto;
          padding: 64px 32px 100px;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 56px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--border-light);
        }

        .brand {
          display: flex;
          flex-direction: column;
        }

        .logo {
          font-size: 2.25rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--text-primary);
          background: linear-gradient(135deg, var(--carolina) 0%, var(--carolina-dark) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .logo span {
          color: var(--accent);
          -webkit-text-fill-color: var(--accent);
        }

        .tagline {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-top: 4px;
          letter-spacing: 0.01em;
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
          background: linear-gradient(135deg, var(--carolina-pale) 0%, rgba(0, 184, 148, 0.08) 100%);
          border-radius: 16px;
          padding: 32px 36px;
          margin-bottom: 32px;
          border: 1px solid var(--border-light);
          box-shadow: 0 2px 8px rgba(0, 102, 204, 0.06);
          position: relative;
          overflow: hidden;
        }

        .info-section::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -20%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(0, 102, 204, 0.1) 0%, transparent 70%);
          border-radius: 50%;
        }

        .info-section h3 {
          font-size: 1.375rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 16px;
          position: relative;
          z-index: 1;
        }

        .info-section p {
          font-size: 1rem;
          line-height: 1.65;
          color: var(--text-primary);
          margin-bottom: 14px;
          position: relative;
          z-index: 1;
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
          border-radius: 16px;
          padding: 40px;
          margin-bottom: 24px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border-light);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--carolina) 0%, var(--carolina-light) 50%, var(--accent) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .card:hover::before {
          opacity: 1;
        }

        .card:hover {
          box-shadow: var(--shadow-hover);
          transform: translateY(-2px);
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
          padding: 18px 32px;
          background: linear-gradient(135deg, var(--carolina) 0%, var(--carolina-dark) 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-family: var(--font);
          font-size: 1.0625rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 102, 204, 0.2);
          position: relative;
          overflow: hidden;
        }

        .btn-primary::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, var(--carolina-dark) 0%, var(--carolina) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .btn-primary:hover::before {
          opacity: 1;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 102, 204, 0.35);
        }

        .btn-primary:active {
          transform: translateY(0);
        }

        .btn-primary span {
          position: relative;
          z-index: 1;
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
          padding: 36px;
          color: white;
          text-align: center;
          box-shadow: var(--shadow-lg);
          position: relative;
          overflow: hidden;
        }

        .tax-summary::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.1) 0%, transparent 60%);
        }

        .tax-summary-label {
          font-size: 0.9375rem;
          opacity: 0.95;
          margin-bottom: 20px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          position: relative;
          z-index: 1;
        }

        .tax-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 12px;
          position: relative;
          z-index: 1;
        }

        .tax-amount {
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.1);
          padding: 24px;
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }

        .tax-amount-value {
          font-size: 2.25rem;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .tax-amount-period {
          font-size: 0.875rem;
          opacity: 0.9;
          margin-top: 4px;
          font-weight: 500;
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
