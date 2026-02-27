"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

type Company = {
  id: string;
  slug: string;
  name: string;
  companyTag: string;
  domain: string | null;
  isActive: boolean;
};

type CompanyContextValue = {
  companies: Company[];
  activeCompany: string | null; // companyTag or null for "all"
  setActiveCompany: (tag: string | null) => void;
  loading: boolean;
};

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  activeCompany: null,
  setActiveCompany: () => {},
  loading: true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem("am-active-company");
    if (stored) setActiveCompanyState(stored === "all" ? null : stored);

    // Fetch companies
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCompanies(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const setActiveCompany = useCallback((tag: string | null) => {
    setActiveCompanyState(tag);
    localStorage.setItem("am-active-company", tag ?? "all");
  }, []);

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompany, setActiveCompany, loading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
