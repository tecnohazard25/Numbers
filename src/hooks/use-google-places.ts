"use client";

import { useEffect, useRef, useCallback } from "react";

interface PlaceResult {
  street: string;
  zip_code: string;
  city: string;
  province: string;
  region: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();

  return new Promise((resolve) => {
    if (scriptLoading) {
      loadCallbacks.push(resolve);
      return;
    }

    if (!API_KEY) {
      resolve();
      return;
    }

    scriptLoading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&language=it`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptLoading = false;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function extractAddressComponents(
  place: google.maps.places.PlaceResult
): PlaceResult {
  const result: PlaceResult = {
    street: "",
    zip_code: "",
    city: "",
    province: "",
    region: "",
  };

  const components = place.address_components ?? [];
  let route = "";
  let streetNumber = "";

  for (const comp of components) {
    const types = comp.types;
    if (types.includes("route")) {
      route = comp.long_name;
    } else if (types.includes("street_number")) {
      streetNumber = comp.short_name;
    } else if (types.includes("postal_code")) {
      result.zip_code = comp.short_name;
    } else if (
      types.includes("locality") ||
      types.includes("administrative_area_level_3")
    ) {
      result.city = comp.long_name;
    } else if (types.includes("administrative_area_level_2")) {
      result.province = comp.short_name; // e.g., "RM"
    } else if (types.includes("administrative_area_level_1")) {
      result.region = comp.long_name;
    }
  }

  result.street = streetNumber ? `${route}, ${streetNumber}` : route;
  return result;
}

export function useGooglePlaces() {
  const autocompleteRefs = useRef<
    Map<string, google.maps.places.Autocomplete>
  >(new Map());

  useEffect(() => {
    if (API_KEY) {
      loadGoogleMapsScript();
    }
    return () => {
      autocompleteRefs.current.forEach((autocomplete) => {
        google.maps.event.clearInstanceListeners(autocomplete);
      });
      autocompleteRefs.current.clear();
    };
  }, []);

  const attachAutocomplete = useCallback(
    (
      inputElement: HTMLInputElement,
      key: string,
      onPlaceSelect: (result: PlaceResult) => void
    ) => {
      if (!API_KEY || !scriptLoaded || !window.google?.maps?.places) return;

      // Clean up existing autocomplete for this key
      const existing = autocompleteRefs.current.get(key);
      if (existing) {
        google.maps.event.clearInstanceListeners(existing);
      }

      const autocomplete = new google.maps.places.Autocomplete(inputElement, {
        types: ["address"],
        componentRestrictions: { country: "it" },
        fields: ["address_components"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.address_components) {
          onPlaceSelect(extractAddressComponents(place));
        }
      });

      autocompleteRefs.current.set(key, autocomplete);
    },
    []
  );

  const detachAutocomplete = useCallback((key: string) => {
    const existing = autocompleteRefs.current.get(key);
    if (existing) {
      google.maps.event.clearInstanceListeners(existing);
      autocompleteRefs.current.delete(key);
    }
  }, []);

  return {
    attachAutocomplete,
    detachAutocomplete,
    isAvailable: !!API_KEY,
  };
}
