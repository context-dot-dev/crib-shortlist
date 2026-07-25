export const LISTING_PROVIDERS = [
  {
    domain: "craigslist.org",
    label: "craigslist",
    url: "https://sfbay.craigslist.org/search/sfc/apa",
  },
  {
    domain: "rentbt.com",
    label: "brick + timber",
    url: "https://rentbt.com/listings/",
  },
  {
    domain: "rentsfnow.com",
    label: "rentsfnow",
    url: "https://www.rentsfnow.com/",
    fallbackLookup: {
      type: "by_name",
      name: "RentSFNow",
    },
  },
  {
    domain: "mosserliving.com",
    label: "mosser",
    url: "https://www.mosserliving.com/san-francisco-apartments/",
  },
  {
    domain: "jwavro.com",
    label: "j. wavro",
    url: "https://www.jwavro.com/rental_list.php?hood=sfc",
  },
  {
    domain: "rentalsinc.com",
    label: "rentals inc.",
    url: "https://www.rentalsinc.com/markets/san-francisco",
  },
  {
    domain: "rentalsinsf.com",
    label: "rentals in sf",
    url: "https://www.rentalsinsf.com/listings/",
  },
  {
    domain: "landmarksf.com",
    label: "landmark sf",
    url: "https://www.landmarksf.com/floorplans",
  },
  {
    domain: "relisto.com",
    label: "relisto",
    url: "https://www.relisto.com/search/",
  },
] as const;

export type ProviderBrand = {
  domain: string;
  label: string;
  url: string;
  title: string;
  logoUrl: string | null;
  color: string | null;
};

export function fallbackProviderBrands(): ProviderBrand[] {
  return LISTING_PROVIDERS.map((provider) => ({
    domain: provider.domain,
    label: provider.label,
    url: provider.url,
    title: provider.label,
    logoUrl: null,
    color: null,
  }));
}
