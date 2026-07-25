import {
  SOURCE_IDS,
  isSearchSource,
  selectedSources,
  type SearchSource,
  type SourceId,
} from "../../shared/providers";
import { discoverCraigslistListings } from "./craigslist";
import {
  discoverExtractedInventory,
  type ExtractedInventoryConfig,
} from "./extracted-inventory";
import { discoverMosserListings } from "./mosser";
import { discoverRentBtListings } from "./rentbt";
import { discoverRentalsInSfListings } from "./rentalsinsf";
import { discoverRentSfNowListings } from "./rentsfnow";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";

export {
  SOURCE_IDS,
  isSearchSource,
  selectedSources,
  type SearchSource,
  type SourceId,
};

type SourceAdapter = (
  preferences: Preferences,
  apiKey: string,
) => Promise<ApartmentCard[]>;

const extractedInventoryAdapter = (
  config: ExtractedInventoryConfig,
): SourceAdapter =>
  (preferences, apiKey) =>
    discoverExtractedInventory(config, preferences, apiKey);

const SOURCE_ADAPTERS = {
  "brick-timber": discoverRentBtListings,
  rentsfnow: discoverRentSfNowListings,
  mosser: discoverMosserListings,
  craigslist: discoverCraigslistListings,
  jwavro: extractedInventoryAdapter({
    id: "jwavro",
    inventoryUrl: "https://www.jwavro.com/rental_list.php?hood=sfc",
    instructions:
      "Extract every currently available San Francisco rental shown on this inventory page, up to 20. Use the exact detail-page URL, numeric monthly rent, bedrooms and bathrooms. Preserve image URLs when visible. Do not include navigation or properties outside San Francisco. Do not invent missing values.",
    caveat:
      "Live J. Wavro inventory. Verify availability before applying.",
    maxCandidates: 20,
  }),
  rentalsinc: extractedInventoryAdapter({
    id: "rentalsinc",
    inventoryUrl: "https://www.rentalsinc.com/markets/san-francisco",
    instructions:
      "Extract every currently available residential apartment in San Francisco, up to 50. Use the exact public detail-page URL, numeric monthly rent, bedrooms, bathrooms, address and all visible image URLs. Exclude rooms, SROs, navigation, and properties outside San Francisco. Do not invent missing values.",
    caveat:
      "Live Rentals Inc. inventory. Verify availability before applying.",
    requireSanFranciscoAddress: true,
  }),
  rentalsinsf: discoverRentalsInSfListings,
  landmark: extractedInventoryAdapter({
    id: "landmark",
    inventoryUrl: "https://www.landmarksf.com/floorplans",
    instructions:
      "Extract every currently available San Francisco apartment floor plan, up to 50. Use the exact public floor-plan URL, numeric starting monthly rent, bedrooms, bathrooms, square feet, availability and all visible image URLs. Exclude navigation and unavailable floor plans. Do not invent missing values.",
    caveat:
      "Live Landmark SF floor-plan inventory. Confirm the exact unit and price before applying.",
    defaultAddress: "573 S Van Ness Ave, San Francisco, CA 94110",
    requireSanFranciscoAddress: true,
  }),
  relisto: extractedInventoryAdapter({
    id: "relisto",
    inventoryUrl: "https://www.relisto.com/search/",
    instructions:
      "Extract every currently available whole-apartment rental in San Francisco, up to 50. Use the exact public detail-page URL, numeric monthly rent, bedrooms, bathrooms, address, square feet and all visible image URLs. Exclude rooms, SROs, rented or application-received properties, navigation, and properties outside San Francisco. Do not invent missing values.",
    caveat: "Live ReLISTO inventory. Verify availability before applying.",
    requireSanFranciscoAddress: true,
  }),
} satisfies Record<SourceId, SourceAdapter>;

export function runSource(
  sourceId: SourceId,
  preferences: Preferences,
  apiKey: string,
) {
  return SOURCE_ADAPTERS[sourceId](preferences, apiKey);
}
