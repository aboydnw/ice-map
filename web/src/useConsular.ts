import { useCallback, useEffect, useState } from "react";
import { readStoredCountry, storeCountry } from "./consular";
import type { ConsularCollection, ConsularCountry } from "./types";

type Result = { key: string; data: ConsularCollection | null; failed: boolean };

export function useConsular() {
  const [countries, setCountries] = useState<ConsularCountry[]>([]);
  const [selected, setSelected] = useState<string | null>(readStoredCountry);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<ConsularCountry[]>("index.json", controller.signal)
      .then((index) => {
        setCountries(index);
        setSelected((key) => {
          if (!key || index.some((country) => country.key === key)) return key;
          storeCountry(null);
          return null;
        });
      })
      .catch(() => {
        /* An absent index means this optional overlay is unavailable. */
      });
    return () => controller.abort();
  }, []);

  const country = countries.find((entry) => entry.key === selected);
  useEffect(() => {
    if (!country) return;
    const controller = new AbortController();
    fetchJson<ConsularCollection>(country.file, controller.signal)
      .then((data) => {
        if (data.meta.key !== country.key) throw new Error("Country mismatch");
        if (!controller.signal.aborted)
          setResult({ key: country.key, data, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key: country.key, data: null, failed: true });
      });
    return () => controller.abort();
  }, [country, attempt]);

  const select = useCallback((key: string | null) => {
    setResult(null);
    setSelected(key);
    storeCountry(key);
  }, []);
  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);
  const current = country && result?.key === country.key ? result : null;
  const status = !country
    ? "idle"
    : !current
      ? "loading"
      : current.failed
        ? "error"
        : "ready";
  return {
    countries,
    selected,
    districts: current?.data ?? null,
    status,
    select,
    retry,
  } as const;
}

async function fetchJson<T>(file: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/consular/${file}`,
    { signal },
  );
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
