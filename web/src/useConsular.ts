import { useCallback, useEffect, useState } from "react";
import { readStoredCountry, storeCountry } from "./consular";
import type { ConsularCollection, ConsularCountry } from "./types";

export interface ConsularState {
  countries: ConsularCountry[];
  selected: string | null;
  districts: ConsularCollection | null;
  select: (key: string | null) => void;
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/consular/${file}`,
  );
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

/**
 * The consular-district overlay: which countries are available, which one is
 * chosen (remembered across visits), and that country's districts once loaded.
 * A missing index means the overlay is simply not offered.
 */
export function useConsular(): ConsularState {
  const [countries, setCountries] = useState<ConsularCountry[]>([]);
  const [selected, setSelected] = useState<string | null>(readStoredCountry);
  const [loaded, setLoaded] = useState<ConsularCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<ConsularCountry[]>("index.json")
      .then((index) => {
        if (!cancelled) setCountries(index);
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const country = countries.find((c) => c.key === selected) ?? null;

  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    fetchJson<ConsularCollection>(country.file)
      .then((collection) => {
        if (!cancelled) setLoaded(collection);
      })
      .catch((error) => {
        console.error("Consular districts failed to load", error);
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

  const select = useCallback((key: string | null) => {
    setSelected(key);
    storeCountry(key);
  }, []);

  // The last loaded collection only counts while its country is still chosen,
  // so switching back to "None" hides it without another state update.
  const districts = country && loaded?.meta.key === country.key ? loaded : null;

  return { countries, selected, districts, select };
}
